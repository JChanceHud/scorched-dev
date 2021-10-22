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
    <div v-if="channelState === 21">
      Waiting for suggester to answer your question!
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
      Ask a question!
      <br />
      <br />
      <textarea v-model="questionText" placeholder="Enter a question to ask the suggester" />
      <button v-on:click="askQuestion">Ask</button>
    </div>
    <div v-if="channelState === 6">
      Propose a payment and burn for a query.
      <NegotiateCell
        :onSubmit="signNegotation"
      />
      <button v-on:click="declineQuestion">Decline</button>
    </div>
    <div v-if="channelState === 16">
      The suggester has proposed a rate for the query. You may accept, or propose a change to the rate.
      <NegotiateCell
        :defaultSuggesterBurn="ethers.utils.formatUnits(latestAppData.suggesterBurn, 'ether')"
        :defaultAskerBurn="ethers.utils.formatUnits(latestAppData.askerBurn, 'ether')"
        :defaultPayment="ethers.utils.formatUnits(latestAppData.payment, 'ether')"
        :onSubmit="signNegotation"
      />
    </div>
    <div v-if="channelState === 7">
      A rate has been agreed upon.
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
    <div v-if="channelState === 17">
      Answer the question!
      <br />
      <br />
      <textarea v-model="answerText" placeholder="Enter a quality answer to the question" />
      <button v-on:click="answerQuestion">Answer</button>
    </div>
    <div v-if="channelState === 8">
      Your query has been answered.
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
    <div v-if="channelState === 11">
      Channel has been finalized and concluded. Open a new channel to start communication.
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
  parseAppData,
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
    },
    amIAsker: function () {
      return this.channel.participants.indexOf(ethers.utils.getAddress(this.$store.state.wallet.activeAddress)) === 1
    },
    latestQuery: function () {
      const { channel } = this
      if (!channel || !channel.queries || !channel.queries.length) return
      return channel.queries[channel.queries.length - 1]
    },
    latestAppData: function () {
      if (this.channel.states.length < 5) return {}
      return parseAppData(this.channel.states[this.channel.states.length - 1].appData)
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
  depositAmount = '0'
  questionText = ''
  answerText = ''
  // Possible states
  // 0 = awaiting counterparty deposit
  // 1 = awaiting counterparty signature
  // 21 = awaiting answer to question
  // 2 = signing pre deposit state
  // 3 = performing deposit
  // 4 = signing post deposit state
  // 5 = asking a question (asker) (no signature)
  // 15 = asking a question (asker) (with signature/rate)
  // 6 = proposing a rate for a query (or declining without sig) (suggester)
  // 16 = confirming the rate (asker)
  // 7 = accepting or rejecting an ask (suggester)
  // 17 = providing an answer
  // 8 = paying or burning (asker)
  // asking a new question
  // 9 = withdrawal was initiated
  // 10 = withdrawal signed, ready for l1 broadcast
  // 11 = withdrawal complete

  async mounted() {
    await this.calculateState()
  }

  async askQuestion() {
    await this.$store.dispatch('submitQuestion', {
      channelId: this.channel.id,
      question: this.questionText,
    })
  }

  async declineQuestion() {
    await this.$store.dispatch('declineQuestion', {
      channelId: this.channel.id,
    })
  }

  async answerQuestion() {
    await this.$store.dispatch('submitAnswer', {
      channelId: this.channel.id,
      answer: this.answerText,
    })
  }

  async finalize() {
    const { channel } = this
    if (!channel) return
    const latestState = channel.states[channel.states.length - 1]
    const contractAddress = channel.baseState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const adjudicator = new ethers.Contract(adjudicatorAddress, AdjudicatorABI, this.$store.state.wallet.signer)
    const { amIAsker } = this
    const sigs = channel.signatures.slice(-2)
    const orderedSigs = latestState.turnNum % 2 === 1 ? sigs : [...sigs].reverse()
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
    const { amIAsker } = this
    const myAmount = ethers.utils.parseEther(this.depositAmount)
    const prevOutcome = channel.states.length > 0 && channel.states[0].outcome[0].allocationItems[0].amount
    const contractAddress = baseState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const state = {
      ...baseState,
      turnNum: channel.states.length,
      outcome: createOutcome([
        {
          address: channel.participants[0],
          amount: amIAsker ? prevOutcome : myAmount,
        },
        {
          address: channel.participants[1],
          amount: amIAsker ? myAmount : '0',
        },
        {
          address: ethers.constants.AddressZero,
          amount: 0,
        },
      ], adjudicatorAddress)
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
    const { amIAsker } = this
    const depositedAmount = await adjudicator.holdings(ethers.constants.AddressZero, channel.id)
    const tx = await adjudicator.deposit(
      ethers.constants.AddressZero,
      channel.id,
      depositedAmount,
      allocationItems[amIAsker ? 1 : 0].amount,
      {
        value: allocationItems[amIAsker ? 1 : 0].amount,
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
    const askerBalance = lastState.outcome[0].allocationItems[1].amount
    const suggesterBalance = lastState.outcome[0].allocationItems[0].amount
    const beneficiaryBalance = lastState.outcome[0].allocationItems[2].amount
    const askerSpend = ethers.BigNumber.from(payment).gt(askerBurn) ? payment : askerBurn
    const askerRefund = shouldPay ? askerSpend.sub(payment) : askerSpend.sub(askerBurn)
    const suggesterRefund = shouldPay ? ethers.BigNumber.from(payment).add(suggesterBurn) : ethers.BigNumber.from(0)
    const contractAddress = lastState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const outcome = createOutcome([
      {
        address: this.channel.participants[0],
        amount: ethers.BigNumber.from(suggesterBalance).add(suggesterRefund),
      },
      {
        address: this.channel.participants[1],
        amount: ethers.BigNumber.from(askerBalance).add(askerRefund),
      },
      {
        address: ethers.constants.AddressZero,
        amount: ethers.BigNumber.from(beneficiaryBalance).sub(askerRefund).sub(suggesterRefund),
      },
    ], adjudicatorAddress)
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
    const askerBalance = lastState.outcome[0].allocationItems[1].amount
    const suggesterBalance = lastState.outcome[0].allocationItems[0].amount
    const beneficiaryBalance = lastState.outcome[0].allocationItems[2].amount
    const askerSpend = ethers.BigNumber.from(payment).gt(askerBurn) ? payment : askerBurn
    const contractAddress = lastState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const outcome = acceptOrDecline ? createOutcome([
      {
        address: this.channel.participants[0],
        amount: ethers.BigNumber.from(suggesterBalance).sub(suggesterBurn),
      },
      {
        address: this.channel.participants[1],
        amount: ethers.BigNumber.from(askerBalance).sub(askerSpend),
      },
      {
        address: ethers.constants.AddressZero,
        amount: ethers.BigNumber.from(beneficiaryBalance).add(askerSpend).add(suggesterBurn),
      },
    ], adjudicatorAddress) : lastState.outcome
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
    if (maxAskerCost.gt(allocationItems[1].amount)) {
      throw new Error('Asker does not have enough balance')
    }
    if (ethers.BigNumber.from(suggesterBurn).gt(allocationItems[0].amount)) {
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
      question: this.questionText,
      state: {
        ...lastState,
        appData: appDataBytes,
        turnNum: this.channel.states.length,
      },
    })
  }

  async calculateState() {
    // determine the state
    this.channelState = -1
    const { channel } = this
    if (!channel) return
    const { baseState } = channel
    const contractAddress = baseState.appDefinition
    const contract = new ethers.Contract(contractAddress, ScorchedABI, this.$store.state.wallet.signer)
    const adjudicatorAddress = await contract.assetHolder()
    const adjudicator = new ethers.Contract(adjudicatorAddress, AdjudicatorABI, this.$store.state.wallet.signer)
    const { amIAsker } = this
    const askerIsActive = channel.states.length % 2 === 1
    if (channel.states.length === 0) {
      // first prefund state
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 2
      }
      return
    }
    if (channel.states.length === 1) {
      // first prefund state
      if (amIAsker) {
        this.channelState = 2
      } else {
        this.channelState = 1
      }
      return
    }
    const lastState = channel.states[channel.states.length - 1]
    // check for finalization
    const secondToLastState = channel.states[channel.states.length - 2]

    const depositedAmount = await adjudicator.holdings(ethers.constants.AddressZero, channel.id)
    // TODO: handle 0 balance deposits (for suggester possibly)
    if (secondToLastState.isFinal && secondToLastState.turnNum === lastState.turnNum) {
      if (depositedAmount.gt(0)) {
        this.channelState = 10
      } else {
        this.channelState = 11
      }
      return
    }
    if (lastState.isFinal) {
      if (!askerIsActive && !amIAsker) {
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
    if (depositedAmount.eq(0)) {
      // suggester should deposit
      if (amIAsker) {
        this.channelState = 0
      } else {
        this.channelState = 3
      }
      return
    } else if (depositedAmount.lt(targetDeposit)) {
      if (amIAsker) {
        this.channelState = 3
      } else {
        this.channelState = 0
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
    // get the latest query, if one exists
    const { latestQuery } = this
    // 3 is from the QueryState enum
    if (!latestQuery || latestQuery.state === 3) {
      // need to propose a query
      if (amIAsker) {
        this.channelState = 5
      } else {
        this.channelState = 1
      }
      return
    }

    // otherwise we have an active query
    // short circuit for early states to avoid parsing AppData
    if (channel.states.length === 4) {
      // suggester needs to propose a rate
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 6
      }
      return
    }

    // let's look at the latest state
    const [[
      payment,
      suggesterBurn,
      askerBurn,
      status,
      queryStatus,
      responseStatus,
    ]] = decodeAppData(lastState.appData)
    let lastTwoStateRatesMatch = false
    if (channel.states.length > 5) {
      const {
        payment: _payment,
        suggesterBurn: _suggesterBurn,
        askerBurn: _askerBurn,
        status: _status
      } = parseAppData(secondToLastState.appData)
      lastTwoStateRatesMatch = _payment.toString() === payment.toString() &&
        _suggesterBurn.toString() === suggesterBurn.toString() &&
        _askerBurn.toString() === askerBurn.toString() &&
        _status === AppStatus.Negotiate
    }
    if (
      latestQuery.state === 0 &&
      status !== AppStatus.Answer &&
      !askerIsActive &&
      !lastTwoStateRatesMatch
    ) {
      // suggester needs to propose a rate
      // suggester can short circuit and accept the previous rate?
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 6
      }
      return
    }
    if (latestQuery.state === 0 && askerIsActive && status === AppStatus.Negotiate) {
      // asker needs to confirm the rate
      if (amIAsker) {
        this.channelState = 16
      } else {
        this.channelState = 1
      }
      return
    }

    // otherwise we have agreement on a rate
    // now the suggester needs to either accept or decline the query

    if (
      status === AppStatus.Negotiate &&
      lastTwoStateRatesMatch &&
      !askerIsActive
    ) {
      if (amIAsker) {
        this.channelState = 1
      } else {
        this.channelState = 7
      }
      return
    }

    if (
      queryStatus === QueryStatus.Accepted &&
      latestQuery.state === 1
    ) {
      // suggester needs to provide an answer
      if (amIAsker) {
        this.channelState = 21
      } else {
        this.channelState = 17
      }
      return
    }

    if (askerIsActive && queryStatus === QueryStatus.Accepted && latestQuery.state === 2) {
      // ready to pay or burn
      if (amIAsker) {
        this.channelState = 8
      } else {
        this.channelState = 1
      }
      return
    }

    if (askerIsActive && queryStatus === QueryStatus.Declined) {
      // asker needs to ask another question AND propose a rate
      // TODO: discard/overwrite decline states
      if (amIAsker) {
        this.channelState = 15
      } else {
        this.channelState = 1
      }
      return
    }
  }
}
</script>

<style scoped>
</style>
