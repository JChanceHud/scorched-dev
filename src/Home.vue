<template>
  <div class="container">
    <div class="header">
      <div>
        Scorched
      </div>
      <div>
        Account: {{ $store.state.wallet.activeAddress }}
      </div>
    </div>
    <div class="body">
      <div style="display: flex">
        <div>
          Suggester URL:
        </div>
        <div spacer style="width: 10px" />
        <input type="text" placeholder="ws://server:port" v-model="suggesterUrl" />
        <div spacer style="width: 10px" />
        <button v-on:click="connect">
          Connect
        </button>
      </div>
      <div style="display: flex; align-items: center">
        <div :style="`width: 10px; height: 10px; background: ${$store.state.scorched.connected ? 'green' : 'red'}; border-radius: 10px`" />
        <div spacer style="width: 10px" />
        <div>
          {{ $store.state.scorched.connected ? 'Connected' : 'Not Connected' }}
        </div>
      </div>
      <div style="display: flex">
        <div
          style="max-width: 200px; word-break: break-all; padding: 8px"
          v-if="$store.state.scorched.channels.length > 1"
        >
          <div
            v-for="channel of $store.state.scorched.channels"
            style="background: #aaaaff; padding: 4px; margin: 2px; cursor: pointer"
            v-on:click="selectedChannelId = channel.id"
          >
            {{ channel.participants[0].slice(0, 10) }}
          </div>
        </div>
        <div style="padding: 8px">
          <div style="margin: 4px 0px" v-if="$store.state.scorched.channelsById[selectedChannelId]">
            <div>Channel ID: {{ selectedChannelId }}</div>
            <div>Suggester: {{ $store.state.scorched.channelsById[selectedChannelId].participants[1] }}</div>
          </div>
          <div style="margin: 4px 0px" v-if="$store.state.scorched.channelsById[selectedChannelId]">
            <input
              type="text"
              placeholder="Send a message..."
              v-model="messageText"
              v-on:keyup.enter="sendMessage"
            />
            <button v-on:click="sendMessage">Send</button>
          </div>
          <MessageCell
            v-for="message of $store.state.scorched.messagesByChannelId[selectedChannelId]"
            :message="message"
            :key="message.timestamp"
          />
        </div>
        <div style="padding: 8px" v-if="$store.state.scorched.channelsById[selectedChannelId]">
          <div v-if="showingDeposit">
            <div>It's your turn to make a deposit!</div>
            <div>Depositing {{ this.depositAmount.toString()}} wei</div>
            <button v-on:click="deposit">Deposit</button>
          </div>
          <div v-if="showingSignature">
            <div>It's your turn to sign</div>
            <button v-on:click="sign">Sign</button>
          </div>
          <div v-if="!showingDeposit && !showingSignature">
            <div>The counterparty is performing a signature or deposit</div>
          </div>
          <StateCell
            v-for="state of $store.state.scorched.channelsById[selectedChannelId].states"
            :state="state"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import { ethers } from 'ethers'
import { ScorchedABI, AdjudicatorABI } from 'scorched'
import MessageCell from './components/MessageCell'
import StateCell from './components/StateCell'
import { signStates } from '@statechannels/nitro-protocol'

@Component({
  name: 'Home',
  components: { MessageCell, StateCell, },
  metaInfo: {
    title: 'Scorched dev',
  },
})
export default class Home extends Vue {
  suggesterUrl = ''
  messageText = ''
  selectedChannelId = ''
  showingDeposit = false
  depositAmount = 0
  showingSignature = false

  async connect() {
    await this.$store.dispatch('connect', this.suggesterUrl)
    if (this.$store.state.scorched.channels.length) {
      this.selectedChannelId = this.$store.state.scorched.channels[0].id
    }
    await this.nextStateActivity()
  }

  async sendMessage() {
    await this.$store.dispatch('sendMessage', {
      text: this.messageText,
      channelId: this.selectedChannelId,
    })
    this.messageText = ''
  }

  async deposit() {
    const channel = this.$store.state.scorched.channelsById[this.selectedChannelId]
    if (!channel) return
    const { baseState } = channel
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
      this.depositAmount,
      {
        value: this.depositAmount,
      }
    )
    await tx.wait()
  }

  async sign() {
    const channel = this.$store.state.scorched.channelsById[this.selectedChannelId]
    if (!channel) return
    const { baseState } = channel
    if (channel.states.length < 2) {
      // performing the post-deposit checkpoint
      await this.$store.dispatch('signAndSubmitState', {
        channelId: channel.id,
        state: {
          ...baseState,
          turnNum: channel.states.length,
        }
      })
    }
  }

  async nextStateActivity() {
    // determine if it's our turn to do something
    const channel = this.$store.state.scorched.channelsById[this.selectedChannelId]
    if (!channel) return
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
        this.showingDeposit = true
        this.depositAmount = allocationItems[0].amount
      }
      return
    } else if (depositedAmount.lt(targetDeposit)) {
      // suggester should deposit
      if (!amIAsker) {
        this.showingDeposit = true
        this.depositAmount = allocationItems[1].amount
      }
      return
    }
    // asker goes first
    if (channel.states.length % 2 === 0 && amIAsker) {
      this.showingSignature = true
    } else if (channel.states.length % 2 === 1 && !amIAsker) {
      this.showingSignature = true
    }
  }
}
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  justify-content: space-between;
  font-size: 20px;
}
.body {
  align-self: center;
  max-width: 1200px;
  width: 100%;
}
</style>
