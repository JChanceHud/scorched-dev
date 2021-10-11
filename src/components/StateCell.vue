<template>
  <div class="state-cell-container">
    <!-- <div v-if="state.type === 0" style="word-break: break-word">
      {{ message.text }}
    </div> -->
    <div style="display: flex; align-items: center; justify-content: space-between">
      <div style="font-weight: bold; font-size: 21px">
        State #{{ state.turnNum }}
      </div>
      <div>
        <img width="32" height="auto" :src="$store.state.icon.iconsByAddress[stateOwner]" />
      </div>
    </div>
    <div v-if="state.turnNum < 2">
      Pre Deposit
    </div>
    <div v-if="state.turnNum > 1 && state.turnNum < 4">
      Post Deposit
    </div>
    <div v-if="state.isFinal">
      <span style="font-size: 18px; font-weight: bold">Finalization</span>
    </div>
    <div v-if="parsedData && parsedData.status === 0 && !state.isFinal">
      <span style="font-size: 18px; font-weight: bold">Negotiating Payment</span>
    </div>
    <div v-if="parsedData && parsedData.status === 1 && !state.isFinal">
      <span v-if="parsedData.queryStatus === 1" style="font-size: 18px; font-weight: bold">Suggester Accepted</span>
      <span v-if="parsedData.queryStatus === 2" style="font-size: 18px; font-weight: bold">Suggester Declined</span>
    </div>
    <div v-if="parsedData && parsedData.status === 2 && !state.isFinal">
      <span v-if="parsedData.responseStatus === 1" style="font-size: 18px; font-weight: bold">Asker Paid</span>
      <span v-if="parsedData.responseStatus === 2" style="font-size: 18px; font-weight: bold">Asker Burned</span>
    </div>
    <div v-if="parsedData && parsedData.status === 0 && !state.isFinal">
      <div>Payment: {{ ethers.utils.formatUnits(parsedData.payment, 'ether') }} Ether</div>
      <div>Asker Burn: {{ ethers.utils.formatUnits(parsedData.askerBurn, 'ether') }} Ether</div>
      <div>Suggester Burn: {{ ethers.utils.formatUnits(parsedData.suggesterBurn, 'ether') }} Ether</div>
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import relativeTime from 'dayjs/plugin/relativeTime'
import dayjs from 'dayjs'
import { ethers } from 'ethers'
import { decodeAppData, QueryStatus } from 'scorched'

dayjs.extend(relativeTime)

@Component({
  name: 'MessageCell',
  props: [
    'state',
    'channel',
  ],
  computed: {
    parsedData: function () {
      try {
        const [[
          payment,
          suggesterBurn,
          askerBurn,
          status,
          queryStatus,
          responseStatus,
        ]] = decodeAppData(this.state.appData)
        return {
          payment,
          suggesterBurn,
          askerBurn,
          status: +status.toString(),
          queryStatus: +queryStatus.toString(),
          responseStatus: +responseStatus.toString(),
        }
      } catch (_) {
        return
      }
    },
    stateOwner: function () {
      return this.channel.participants[this.state.turnNum % 2]
    }
  }
})
export default class MessageCell extends Vue {
  ethers = ethers
  dayjs = dayjs
  parsedData = undefined
  QueryStatus = QueryStatus
  mounted() {
    this.$store.dispatch('loadIcon', this.stateOwner)
  }
}
</script>

<style scoped>
.state-cell-container {
  border: 1px solid black;
  border-radius: 2px;
  padding: 4px;
  margin: 2px 0px;
}
.timestamp-text {
  font-size: 12px;
}
</style>
