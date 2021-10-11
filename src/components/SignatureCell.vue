<template>
  <div style="border: 1px solid black; padding: 4px">
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
      How much would you like to deposit to the channel?
      <br />
      <br />
      These funds are still yours, you will be able to pay the suggester using the funds.
      <br />
      <EtherAmountField
        v-model="depositAmount"
      />
      <button v-on:click="signPreDeposit">Sign</button>
    </div>
    <div v-if="channelState === 3">
      It's your turn to deposit
      <button v-on:click="deposit">Deposit</button>
    </div>
    <div v-if="channelState === 4">
      Sign the post deposit state
      <button v-on:click="signPostDeposit">Sign</button>
    </div>
    <div v-if="channelState === 5">
      Waiting for post deposit checkpoint transaction. Either party may send this transaction.
      <br />
      <br />
      Message your counterparty to decide who will send it!
      <br />
      <br />
      <button v-on:click="depositCheckpoint">Send Transaction</button>
    </div>
    <div v-if="channelState === 6">
      Propose a payment and burn for a query.
      <NegotiateCell
        :onSubmit="signNegotation"
      />
    </div>
    <div v-if="channelState === 7">
      A query rate has been proposed.
      <br />
      <br />
      <div>Payment: {{ ethers.utils.formatUnits(latestAppData.payment, 'ether') }} Ether</div>
      <div>Asker Burn: {{ ethers.utils.formatUnits(latestAppData.askerBurn, 'ether') }} Ether</div>
      <div>Suggester Burn: {{ ethers.utils.formatUnits(latestAppData.suggesterBurn, 'ether') }} Ether</div>
      <br />
      You may either accept or decline this query.
      <div style="display: flex">
        <button v-on:click="acceptRate">Accept</button>
        <button v-on:click="rejectRate">Decline</button>
      </div>
    </div>
    <div v-if="channelState === 8">
      Your query has been accepted.
      <br />
      <br />
      <div>Payment: {{ ethers.utils.formatUnits(latestAppData.payment, 'ether') }} Ether</div>
      <div>Asker Burn: {{ ethers.utils.formatUnits(latestAppData.askerBurn, 'ether') }} Ether</div>
      <div>Suggester Burn: {{ ethers.utils.formatUnits(latestAppData.suggesterBurn, 'ether') }} Ether</div>
      <br />
      When you are ready you may either pay the suggester or burn the funds.
      <div style="display: flex">
        <button v-on:click="pay">Pay</button>
        <button v-on:click="burn">Burn</button>
      </div>
    </div>
    <div v-if="channelState === 9">
      A withdrawal has been initiated. Sign the state to confirm.
      <br />
      <button v-on:click="signWithdrawal">Sign</button>
    </div>
    <div v-if="channelState === 10">
      Withdrawal signed by all parties. Anyone may broadcast this state to L1 to finalize the channel.
      <br />
      <button v-on:click="finalize">Finalize</button>
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
  createOutcome,
} from 'scorched'
import NegotiateCell from './NegotiateCell'
import EtherAmountField from './EtherAmountField'
import { getFixedPart, hashAppPart, encodeOutcome } from '@statechannels/nitro-protocol'

@Component({
  name: 'SignatureCell',
  components: { NegotiateCell, EtherAmountField, },
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
    },
    l1Balances: function () {
      const channel = this.$store.state.scorched.channelsById[this.channelId]
      if (!channel) return {}
      return channel.balances
    }
  },
  watch: {
    states: function () {
      this.calculateState()
    },
    l1Balances: function () {
      this.calculateState()
    }
  }
})
export default class SignatureCell extends Vue {
  ethers = ethers
  channelState = -1
  latestAppData = {}
  depositAmount = '0'
  // Possible states
  // 0 = awaiting counterparty deposit
  // 1 = awaiting counterparty signature
  // 2 = signing pre deposit state
  // 3 = performing deposit
  // 4 = signing post deposit state
  // 5 = awaiting post deposit checkpoint tx
  // 6 = proposing a new rate (asker)
  // 7 = accepting or rejecting an ask (suggester)
  //    if rejected allow proposing a different rate?
  // 8 = paying or burning (asker)
  // 9 = withdrawal was initiated
  // 10 = withdrawal signed, ready for l1 broadcast

  async mounted() {
    await this.calculateState()
  }

  async finalize() {
    const { channel } = this
    if (!channel) return
    const latestState = channel.states[channel.states.length - 1]
    const contractAddress = channel.baseState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const adjudicator = new ethers.Contract(adjudicatorAddress, AdjudicatorABI, this.$store.state.wallet.signer)
    const amIAsker = channel.participants.indexOf(ethers.utils.getAddress(this.$store.state.wallet.activeAddress)) === 0
    const sigs = channel.signatures.slice(-2)
    const orderedSigs = latestState.turnNum % 2 === 0 ? sigs : [...sigs].reverse()
    const tx = await adjudicator.concludeAndTransferAllAssets(
      latestState.turnNum,
      getFixedPart(latestState),
      hashAppPart(latestState),
      encodeOutcome(latestState.outcome),
      1, // number of states (everyone signed the same one)
      [0, 0], // everyone signed same state
      orderedSigs,
    )
    await tx.wait()
  }

  async signWithdrawal() {
    const { channel } = this
    if (!channel) return
    const latestState = channel.states[channel.states.length - 1]
    // sign the exact state
    await this.$store.dispatch('signAndSubmitState', {
      channelId: channel.id,
      state: latestState,
    })
  }

  async signPreDeposit() {
    const { channel } = this
    if (!channel) return
    const { baseState } = channel
    const amIAsker = channel.participants.indexOf(ethers.utils.getAddress(this.$store.state.wallet.activeAddress)) === 0
    const myAmount = ethers.utils.parseEther(this.depositAmount)
    const prevOutcome = channel.states.length > 0 && channel.states[0].outcome[0].allocationItems[0].amount
    const contractAddress = baseState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const state = {
      ...baseState,
      turnNum: channel.states.length,
      outcome: createOutcome({
        [channel.participants[0]]: amIAsker ? myAmount : prevOutcome,
        [channel.participants[1]]: amIAsker ? '0' : myAmount,
        [ethers.constants.AddressZero]: 0,
      }, adjudicatorAddress)
    }
    await this.$store.dispatch('signAndSubmitState', {
      channelId: channel.id,
      state,
    })
  }

  async deposit() {
    const { channel } = this
    if (!channel) return
    const lastState = this.channel.states[this.channel.states.length - 1]
    const [{allocationItems}] = lastState.outcome
    const contractAddress = channel.baseState.appDefinition
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
        value: allocationItems[amIAsker ? 0 : 1].amount,
      }
    )
    await tx.wait()
  }

  async signPostDeposit() {
    const { channel } = this
    const latestState = channel.states[channel.states.length - 1]
    await this.$store.dispatch('signAndSubmitState', {
      channelId: channel.id,
      state: {
        ...latestState,
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
    const lastState = this.channel.states[this.channel.states.length - 1]
    const askerBalance = lastState.outcome[0].allocationItems[0].amount
    const suggesterBalance = lastState.outcome[0].allocationItems[1].amount
    const beneficiaryBalance = lastState.outcome[0].allocationItems[2].amount
    const askerSpend = ethers.BigNumber.from(payment).gt(askerBurn) ? payment : askerBurn
    const askerRefund = shouldPay ? askerSpend.sub(payment) : askerSpend.sub(askerBurn)
    const suggesterRefund = shouldPay ? ethers.BigNumber.from(payment).add(suggesterBurn) : ethers.BigNumber.from(0)
    const contractAddress = lastState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const outcome = createOutcome({
      [this.channel.participants[0]]: ethers.BigNumber.from(askerBalance).add(askerRefund),
      [this.channel.participants[1]]: ethers.BigNumber.from(suggesterBalance).add(suggesterRefund),
      [ethers.constants.AddressZero]: ethers.BigNumber.from(beneficiaryBalance).sub(askerRefund).sub(suggesterRefund),
    }, adjudicatorAddress)
    await this.$store.dispatch('signAndSubmitState', {
      channelId: this.channelId,
      state: {
        ...lastState,
        outcome,
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
    const lastState = this.channel.states[this.channel.states.length - 1]
    const askerBalance = lastState.outcome[0].allocationItems[0].amount
    const suggesterBalance = lastState.outcome[0].allocationItems[1].amount
    const beneficiaryBalance = lastState.outcome[0].allocationItems[2].amount
    const askerSpend = ethers.BigNumber.from(payment).gt(askerBurn) ? payment : askerBurn
    const contractAddress = lastState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const outcome = acceptOrDecline ? createOutcome({
      [this.channel.participants[0]]: ethers.BigNumber.from(askerBalance).sub(askerSpend),
      [this.channel.participants[1]]: ethers.BigNumber.from(suggesterBalance).sub(suggesterBurn),
      [ethers.constants.AddressZero]: ethers.BigNumber.from(beneficiaryBalance).add(askerSpend).add(suggesterBurn),
    }, adjudicatorAddress) : lastState.outcome
    await this.$store.dispatch('signAndSubmitState', {
      channelId: this.channelId,
      state: {
        ...lastState,
        outcome,
        appData: appDataBytes,
        turnNum: this.channel.states.length,
      }
    })
  }

  async signNegotation({ payment, askerBurn, suggesterBurn }) {
    if (!this.channel) return
    const lastState = this.channel.states[this.channel.states.length - 1]
    const [{allocationItems}] = lastState.outcome
    const maxAskerCost = ethers.BigNumber.from(payment).gt(askerBurn) ? ethers.BigNumber.from(payment) : ethers.BigNumber.from(askerBurn)
    if (maxAskerCost.gt(allocationItems[0].amount)) {
      throw new Error('Asker does not have enough balance')
    }
    if (ethers.BigNumber.from(suggesterBurn).gt(allocationItems[1].amount)) {
      throw new Error('Suggester does not have enough balance')
    }
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
        ...lastState,
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
    if (!channel) return
    const { baseState } = channel
    const contractAddress = baseState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const adjudicator = new ethers.Contract(adjudicatorAddress, AdjudicatorABI, this.$store.state.wallet.signer)
    const amIAsker = channel.participants.indexOf(ethers.utils.getAddress(this.$store.state.wallet.activeAddress)) === 0
    const askerIsActive = channel.states.length % 2 === 0
    if (channel.states.length === 0) {
      // first prefund state
      if (amIAsker) {
        this.channelState = 2
      } else {
        this.channelState = 1
      }
      return
    }
    if (channel.states.length === 1) {
      // first prefund state
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 2
      }
      return
    }
    const lastState = channel.states[channel.states.length - 1]
    // check for finalization
    const secondToLastState = channel.states[channel.states.length - 2]

    if (secondToLastState.isFinal && secondToLastState.turnNum === lastState.turnNum) {
      this.channelState = 10
      return
    }
    if (lastState.isFinal) {
      if (askerIsActive && amIAsker) {
        this.channelState = 9
      } else {
        this.channelState = 1
      }
      return
    }
    const [{allocationItems}] = lastState.outcome
    const targetDeposit = allocationItems.reduce((acc, { amount }) => {
      return acc.add(amount)
    }, ethers.BigNumber.from(0))
    const depositedAmount = await adjudicator.holdings(ethers.constants.AddressZero, channel.id)
    if (depositedAmount.eq(0)) {
      // asker should deposit
      if (amIAsker) {
        this.channelState = 3
      } else {
        this.channelState = 0
      }
      return
    } else if (depositedAmount.lt(targetDeposit)) {
      if (amIAsker) {
        this.channelState = 0
      } else {
        this.channelState = 3
      }
      return
    }
    // otherwise we have completed the deposit
    // need post checkpoint signatures
    if (channel.states.length < 4 && askerIsActive) {
      if (amIAsker) {
        this.channelState = 4
      } else {
        this.channelState = 1
      }
      return
    } else if (channel.states.length < 4 && !askerIsActive) {
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 4
      }
      return
    }
    // if we're here then the channel has been deposited and signed
    // need to check the latest checkpoint
    // UPDATE: theoretically don't need this on chain tx
    // const { finalizesAt, fingerprint, turnNumRecord } = await adjudicator.unpackStatus(channel.id)
    // if (turnNumRecord === 0) {
    //   // need to run the post deposit checkpoint
    //   this.channelState = 5
    //   return
    // }
    // otherwise we're ready to use the application
    if (channel.states.length === 4) {
      // need to propose a rate
      if (amIAsker) {
        this.channelState = 6
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
    ]] = decodeAppData(lastState.appData)
    this.latestAppData = {
      payment,
      suggesterBurn,
      askerBurn,
      status,
      queryStatus,
      responseStatus,
    }

    if (askerIsActive && queryStatus === QueryStatus.Accepted) {
      // ready to pay or burn
      if (amIAsker) {
        this.channelState = 8
      } else {
        this.channelState = 1
      }
      return
    } else if (askerIsActive && queryStatus === QueryStatus.Declined) {
      // ready to propose a new rate
      if (amIAsker) {
        this.channelState = 6
      } else {
        this.channelState = 1
      }
      return
    } else if (!askerIsActive) {
      // suggester is active, they may accept or reject the proposed query
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 7
      }
      return
    }
  }
}
</script>

<style scoped>
</style>
