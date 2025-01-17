<template>
  <div class="container">
    <div class="header">
      <div>
        Scorched (<a href="https://goerli.etherscan.io/address/0x48ba949f5d6b360c0bbfad8dee26bd8da8649cf6" target="_blank">Görli</a>)
      </div>
      <div
        v-if="$store.state.wallet.activeAddress && +$store.state.wallet.network.chainId === 5"
        style="display: flex; flex-direction: column;"
      >
        <div>
          <div>Account: {{ $store.state.wallet.activeAddress }}</div>
        </div>
        <div style="display: flex; align-items: center; justify-content: flex-end">
          <button v-on:click="$store.dispatch('requestNotificationPermission')">
            Enable Notifications
          </button>
          <button v-on:click="showingRegister = true">Register Suggester</button>
          <div spacer style="width: 8px" />
          <img width="32" height="auto" :src="$store.state.icon.iconsByAddress[$store.state.wallet.activeAddress]" />
        </div>
      </div>
      <div v-if="!$store.state.wallet.activeAddress">
        <button v-on:click="$store.dispatch('load')">Connect MetaMask</button>
      </div>
      <div v-if="+$store.state.wallet.network.chainId !== 5">
        Incorrect network id: {{ $store.state.wallet.network.chainId }} ({{ $store.state.wallet.network.name }})
        <br />
        Please select Goerli network
      </div>
    </div>
    <div class="body">
      <div style="display: flex; align-items: center">
        <div style="display: flex; align-items: center">
          <div :style="`width: 10px; height: 10px; background: ${$store.state.scorched.connected ? 'green' : 'red'}; border-radius: 10px`" />
          <div spacer style="width: 10px" />
          <div>
            {{ $store.state.scorched.connected ? 'Connected' : 'Not Connected' }}
          </div>
        </div>
        <div spacer style="flex: 1" />
        <button v-on:click="showingMarket = true">
          View Registered Suggesters
        </button>
      </div>
      <div spacer style="height: 10px" />
      <div style="display: flex">
        <div
          style="width: 20%; padding: 4px; border: 1px solid black"
        >
          <div>Channels</div>
          <ChannelButton
            v-for="channel of $store.state.scorched.channels"
            :channelId="channel.id"
            v-on:click="selectedChannelId = channel.id"
          />
        </div>
        <div style="margin: 0px 4px; max-width: 60%">
          <div style="margin: 0px 0px; display: flex" v-if="$store.state.scorched.channelsById[selectedChannelId]">
            <div style="word-break: break-all; border: 1px solid black; padding: 2px">
              <div>Channel ID: {{ selectedChannelId }}</div>
              <div>Suggester: {{ $store.state.scorched.channelsById[selectedChannelId].participants[1] }}</div>
              <div style="font-weight: bold">Balances</div>
              <div style="display: flex; margin-bottom: 4px">
                <img width="16" :src="$store.state.icon.iconsByAddress[channel.participants[0]]" />
                <div spacer style="width: 4px" />
                (suggester)
                <div spacer style="width: 4px" />
                {{ suggesterBalance }} Ether
              </div>
              <div style="display: flex; margin-bottom: 4px">
                <img width="16" :src="$store.state.icon.iconsByAddress[channel.participants[1]]" />
                <div spacer style="width: 4px" />
                (asker)
                <div spacer style="width: 4px" />
                {{ askerBalance }} Ether
              </div>
              <div style="display: flex">
                <img width="16" :src="$store.state.icon.iconsByAddress[ethers.constants.AddressZero]" />
                <div spacer style="width: 4px" />
                (beneficiary)
                <div spacer style="width: 4px" />
                {{ beneficiaryBalance }} Ether
              </div>
              <div style="font-weight: bold">Channel Funding</div>
              <div style="display: flex; justify-content: space-between">
                <div>{{ channelBalance }} Ether</div>
                <button v-if="canWithdraw" v-on:click="withdraw">Withdraw</button>
              </div>
            </div>
          </div>
          <div style="margin: 4px 0px" v-if="$store.state.scorched.channelsById[selectedChannelId]">
            <textarea
              type="text"
              placeholder="Send a message..."
              v-model="messageText"
              v-on:keyup.enter="sendMessage"
              style="width: 80%"
            />
            <button v-on:click="sendMessage">Send</button>
          </div>
          <MessageCell
            v-for="message of messages"
            :message="message"
            :key="message.timestamp"
          />
        </div>
        <div
          v-if="$store.state.scorched.channelsById[selectedChannelId]"
          style="width: 20%"
        >
          <SignatureCell :channelId="selectedChannelId" />
          <StateCell
            v-for="state of states"
            :key="state.turnNum"
            :state="state"
            :channel="$store.state.scorched.channelsById[selectedChannelId]"
          />
        </div>
      </div>
    </div>
    <RegisterSuggester
      :onCancel="() => showingRegister = false"
      :visible="showingRegister"
    />
    <SuggesterMarket
      :onCancel="() => showingMarket = false"
      :visible="showingMarket"
      :onCreateChannel="(addr) => channelCreated(addr)"
    />
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
  AppStatus,
  QueryStatus,
  ResponseStatus,
  decodeAppData,
  parseAppData,
} from 'scorched'
import MessageCell from './components/MessageCell'
import StateCell from './components/StateCell'
import NegotiateCell from './components/NegotiateCell'
import SignatureCell from './components/SignatureCell'
import {
  convertBytes32ToAddress,
} from '@statechannels/nitro-protocol'
import RegisterSuggester from './components/RegisterSuggester'
import SuggesterMarket from './components/SuggesterMarket'
import ChannelButton from './components/ChannelButton'

@Component({
  name: 'Home',
  components: {
    MessageCell,
    StateCell,
    NegotiateCell,
    SignatureCell,
    RegisterSuggester,
    SuggesterMarket,
    ChannelButton,
   },
  metaInfo: function () {
    const { totalUnreadCount } = this.$store.state.scorched
    return {
      title: totalUnreadCount === 0 ? 'Scorched dev' : `${totalUnreadCount} unread message${totalUnreadCount === 1 ? '' : 's'}`,
    }
  },
  computed: {
    states: function () {
      const channel = this.$store.state.scorched.channelsById[this.selectedChannelId]
      if (!channel) return []
      return [...channel.states].reverse()
    },
    messages: function () {
      const messages = this.$store.state.scorched.messagesByChannelId[this.selectedChannelId]
      if (!messages) return []
      return [...messages].reverse()
    },
    channel: function () {
      return this.$store.state.scorched.channelsById[this.selectedChannelId]
    },
    askerBalance: function () {
      if (!this.channel || !this.channel.states.length) return 0
      const amount = this.channel.states[this.channel.states.length - 1].outcome[0].allocationItems[1].amount
      const amountBN = ethers.BigNumber.from(amount)
      return ethers.utils.formatUnits(amountBN, 'ether')
    },
    suggesterBalance: function () {
      if (!this.channel || !this.channel.states.length) return 0
      const amount = this.channel.states[this.channel.states.length - 1].outcome[0].allocationItems[0].amount
      const amountBN = ethers.BigNumber.from(amount)
      return ethers.utils.formatUnits(amountBN, 'ether')
    },
    beneficiaryAddress: function () {
      if (!this.channel || !this.channel.states.length) return ethers.constants.AddressZero
      const paddedAddress = this.channel.states[this.channel.states.length - 1].outcome[0].allocationItems[2].destination
      return convertBytes32ToAddress(paddedAddress)
    },
    beneficiaryBalance: function () {
      if (!this.channel || !this.channel.states.length) return 0
      const amount = this.channel.states[this.channel.states.length - 1].outcome[0].allocationItems[2].amount
      const amountBN = ethers.BigNumber.from(amount)
      return ethers.utils.formatUnits(amountBN, 'ether')
    },
    channelBalance: function () {
      if (!this.channel) return 0
      const amount = ethers.BigNumber.from(this.channel.balances[ethers.constants.AddressZero])
      return ethers.utils.formatUnits(amount, 'ether')
    },
    canWithdraw: function () {
      if (!this.channel) return false
      const latestState = this.channel.states[this.channel.states.length - 1]
      const amIAsker = this.channel.participants.indexOf(ethers.utils.getAddress(this.$store.state.wallet.activeAddress)) === 1
      if (!latestState || latestState.turnNum < 4) return false
      if (latestState.turnNum % 2 === (amIAsker ? 0 : 1)) {
        // not our turn
        return false
      }
      if (latestState.isFinal) {
        // let the signature cell handle it
        return false
      }
      const { status, queryStatus } = parseAppData(latestState.appData)
      if (
        +ethers.BigNumber.from(status).toString() === AppStatus.Answer &&
        +ethers.BigNumber.from(queryStatus).toString() === QueryStatus.Accepted
      ) {
        // we're waiting for a response
        return false
      }
      return true
    }
  },
  watch: {
    selectedChannelId: function () {
      if (this.selectedChannelId) {
        this.$store.dispatch('markChannelRead', this.selectedChannelId)
      }
    },
    messages: function () {
      if (this.selectedChannelId) {
        this.$store.dispatch('markChannelRead', this.selectedChannelId)
      }
    }
  }
})
export default class Home extends Vue {
  ethers = ethers
  messageText = ''
  selectedChannelId = ''
  showingRegister = false
  showingMarket = false

  async channelCreated(channelId) {
    this.showingMarket = false
    this.selectedChannelId = channelId
  }

  async withdraw() {
    const { baseState } = this.channel
    const latestState = this.channel.states[this.channel.states.length - 1]
    const state = {
      ...latestState,
      status: AppStatus.Negotiate,
      queryStatus: QueryStatus.None,
      responseStatus: ResponseStatus.None,
      isFinal: true,
      turnNum: this.channel.states.length,
    }
    await this.$store.dispatch('signAndSubmitState', {
      channelId: this.selectedChannelId,
      state,
    })
  }

  async sendMessage() {
    if (!this.messageText) return
    await this.$store.dispatch('sendMessage', {
      text: this.messageText,
      channelId: this.selectedChannelId,
    })
    this.messageText = ''
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
  margin-bottom: 8px;
}
.body {
  align-self: center;
  max-width: 1200px;
  width: 100%;
}
</style>
