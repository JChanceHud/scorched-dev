<template>
  <div>
    <div v-if="channelState === -1">
      Loading state information...
    </div>
    <div v-if="channelState === 0">
      Awaiting counterparty deposit
    </div>
    <div v-if="channelState === 1">
      Awaiting counterparty signature
    </div>
    <div v-if="channelState === 2">
      It's your turn to deposit
      <button v-on:click="deposit">Deposit</button>
    </div>
    <div v-if="channelState === 3">
      Sign the post deposit state
      <button v-on:click="signPostDeposit">Sign</button>
    </div>
    <div v-if="channelState === 4">
      Waiting for post deposit checkpoint transaction. Either party may send this transaction.
      <br />
      Message your counterparty to decide who will send it!
      <br />
      <button v-on:click="depositCheckpoint">Send Transaction</button>
    </div>
    <div v-if="channelState === 5">
      Propose a payment and burn for a query.
      <NegotiateCell
        :onSubmit="signNegotation"
      />
    </div>
    <div v-if="channelState === 6">
      A query rate has been proposed.
      <div>Payment: {{ latestAppData.payment.toString() }} wei</div>
      <div>Asker Burn: {{ latestAppData.askerBurn.toString() }} wei</div>
      <div>Suggester Burn: {{ latestAppData.suggesterBurn.toString() }} wei</div>
      You may either accept or decline this query.
      <button v-on:click="acceptRate">Accept</button>
      <button v-on:click="rejectRate">Decline</button>
    </div>
    <div v-if="channelState === 7">
      Your query has been accepted.
      <div>Payment: {{ latestAppData.payment.toString() }} wei</div>
      <div>Asker Burn: {{ latestAppData.askerBurn.toString() }} wei</div>
      <div>Suggester Burn: {{ latestAppData.suggesterBurn.toString() }} wei</div>
      When you are ready you may either pay the suggester or burn the funds.
      <button v-on:click="pay">Pay</button>
      <button v-on:click="burn">Burn</button>
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import { ethers } from 'ethers'
import {
  ScorchedABI,
  AdjudicatorABI,
  encodeAppData,
  decodeAppData,
  AppStatus,
  QueryStatus,
  ResponseStatus,
} from 'scorched'
import NegotiateCell from './NegotiateCell'

@Component({
  name: 'SignatureCell',
  components: { NegotiateCell, },
  props: [
    'channelId',
  ],
  computed: {
    channel: function () {
      return this.$store.state.scorched.channelsById[this.channelId]
    },
    states: function () {
      const channel = this.$store.state.scorched.channelsById[this.channelId]
      if (!channel) return []
      return channel.states
    }
  },
  watch: {
    states: function () {
      this.calculateState()
    }
  }
})
export default class SignatureCell extends Vue {
  channelState = -1
  latestAppData = {}
  // Possible states
  // 0 = awaiting counterparty deposit
  // 1 = awaiting counterparty signature
  // 2 = performing deposit
  // 3 = signing post deposit state
  // 4 = awaiting post deposit checkpoint tx
  // 5 = proposing a new rate (asker)
  // 6 = accepting or rejecting an ask (suggester)
  //    if rejected allow proposing a different rate?
  // 7 = paying or burning (asker)

  async mounted() {
    await this.calculateState()
  }

  async deposit() {
    const { channel } = this
    if (!channel) return
    const { baseState } = channel
    const [{allocationItems}] = baseState.outcome
    const contractAddress = baseState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const adjudicator = new ethers.Contract(adjudicatorAddress, AdjudicatorABI, this.$store.state.wallet.signer)
    const amIAsker = channel.participants.indexOf(ethers.utils.getAddress(this.$store.state.wallet.activeAddress)) === 0
    const depositedAmount = await adjudicator.holdings(ethers.constants.AddressZero, channel.id)
    const tx = await adjudicator.deposit(
      ethers.constants.AddressZero,
      channel.id,
      depositedAmount,
      allocationItems[amIAsker ? 0 : 1].amount,
      {
        value: this.depositAmount,
      }
    )
    await tx.wait()
  }

  async signPostDeposit() {
    const { channel } = this
    await this.$store.dispatch('signAndSubmitState', {
      channelId: channel.id,
      state: {
        ...baseState,
        turnNum: channel.states.length,
      }
    })
  }

  async depositCheckpoint() {
    try {
      await this.$store.dispatch('createCheckpoint', this.channelId)
    } catch (err) {
      console.log(err)
    }
  }

  async pay() {
    await this.askerValidate(true)
  }

  async burn() {
    await this.askerValidate(false)
  }

  async askerValidate(shouldPay) {
    const [[
      payment,
      suggesterBurn,
      askerBurn,
      status,
      queryStatus,
      responseStatus,
    ]] = decodeAppData(this.channel.states[this.channel.states.length - 1].appData)
    const appData = {
      payment,
      askerBurn,
      suggesterBurn,
      status: AppStatus.Validate,
      queryStatus: QueryStatus.None,
      responseStatus: shouldPay ? ResponseStatus.Pay : ResponseStatus.Burn,
    }
    const appDataBytes = encodeAppData(appData)
    await this.$store.dispatch('signAndSubmitState', {
      channelId: this.channelId,
      state: {
        ...this.channel.baseState,
        appData: appDataBytes,
        turnNum: this.channel.states.length,
      }
    })
  }

  async acceptRate() {
    // suggester signs
    await this.suggesterRespond(true)
  }

  async rejectRate() {
    await this.suggesterRespond(false)
  }

  async suggesterRespond(acceptOrDecline) {
    const [[
      payment,
      suggesterBurn,
      askerBurn,
      status,
      queryStatus,
      responseStatus,
    ]] = decodeAppData(this.channel.states[this.channel.states.length - 1].appData)
    const appData = {
      payment,
      askerBurn,
      suggesterBurn,
      status: AppStatus.Answer,
      queryStatus: acceptOrDecline ? QueryStatus.Accepted : QueryStatus.Declined,
      responseStatus: ResponseStatus.None,
    }
    const appDataBytes = encodeAppData(appData)
    await this.$store.dispatch('signAndSubmitState', {
      channelId: this.channelId,
      state: {
        ...this.channel.baseState,
        appData: appDataBytes,
        turnNum: this.channel.states.length,
      }
    })
  }

  async signNegotation({ payment, askerBurn, suggesterBurn }) {
    if (!this.channel) return
    const appData = {
      payment,
      askerBurn,
      suggesterBurn,
      status: AppStatus.Negotiate,
      queryStatus: QueryStatus.None,
      responseStatus: ResponseStatus.None,
    }
    const appDataBytes = encodeAppData(appData)
    await this.$store.dispatch('signAndSubmitState', {
      channelId: this.channelId,
      state: {
        ...this.channel.baseState,
        appData: appDataBytes,
        turnNum: this.channel.states.length,
      }
    })
  }

  async calculateState() {
    // determine the state
    this.channelState = -1
    this.latestAppData = {}
    const { channel } = this
    if (!channel) return console.log('no channel')
    const { baseState } = channel
    const [{allocationItems}] = baseState.outcome
    const targetDeposit = allocationItems.reduce((acc, { amount }) => {
      return acc.add(amount)
    }, ethers.BigNumber.from(0))
    const latestSignature = channel.states[channel.states.length - 1]
    const contractAddress = baseState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const adjudicator = new ethers.Contract(adjudicatorAddress, AdjudicatorABI, this.$store.state.wallet.signer)
    const amIAsker = channel.participants.indexOf(ethers.utils.getAddress(this.$store.state.wallet.activeAddress)) === 0
    const depositedAmount = await adjudicator.holdings(ethers.constants.AddressZero, channel.id)
    if (depositedAmount.eq(0)) {
      // asker should deposit
      if (amIAsker) {
        this.channelState = 2
      } else {
        this.channelState = 0
      }
      return
    } else if (depositedAmount.lt(targetDeposit)) {
      if (amIAsker) {
        this.channelState = 0
      } else {
        this.channelState = 2
      }
      return
    }
    // otherwise we have completed the deposit
    // need post checkpoint signatures
    const askerIsActive = channel.states.length % 2 === 0
    if (channel.states.length < 2 && askerIsActive) {
      if (amIAsker) {
        this.channelState = 3
      } else {
        this.channelState = 1
      }
      return
    } else if (channel.states.length < 2 && !askerIsActive) {
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 3
      }
      return
    }
    // if we're here then the channel has been deposited and signed
    // need to check the latest checkpoint
    const { finalizesAt, fingerprint, turnNumRecord } = await adjudicator.unpackStatus(channel.id)
    if (turnNumRecord === 0) {
      // need to run the post deposit checkpoint
      this.channelState = 4
      return
    }
    // otherwise we're ready to use the application
    if (channel.states.length === 2) {
      // need to propose a rate
      if (amIAsker) {
        this.channelState = 5
      } else {
        this.channelState = 1
      }
      return
    }
    // if we're past turn 3 we have a rate and are ready to use the app
    // let's look at the latest state
    const [[
      payment,
      suggesterBurn,
      askerBurn,
      status,
      queryStatus,
      responseStatus,
    ]] = decodeAppData(channel.states[channel.states.length - 1].appData)
    this.latestAppData = {
      payment,
      suggesterBurn,
      askerBurn,
      status,
      queryStatus,
      responseStatus,
    }
    console.log(status, queryStatus)

    if (askerIsActive && queryStatus === QueryStatus.Accepted) {
      // ready to pay or burn
      if (amIAsker) {
        this.channelState = 7
      } else {
        this.channelState = 1
      }
      return
    } else if (askerIsActive && queryStatus === QueryStatus.Declined) {
      // ready to propose a new rate
      if (amIAsker) {
        this.channelState = 5
      } else {
        this.channelState = 1
      }
      return
    } else if (!askerIsActive) {
      // suggester is active, they may accept or reject the proposed query
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 6
      }
      return
    }
  }
}
</script>

<style scoped>
</style>
