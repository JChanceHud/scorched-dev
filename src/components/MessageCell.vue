<template>
  <div class="message-cell-container">
    <div style="display: flex; align-items: center">
      <img v-if="message.from" width="20" :src="$store.state.icon.iconsByAddress[message.from]" />
      <div v-if="!message.from" style="font-weight: bold">
        System Message
      </div>
      <div style="flex: 1" />
      <div class="timestamp-text">
        {{ this.timestamp }}
      </div>
    </div>
    <div spacer style="height: 8px" />
    <div v-if="message.type === 0" style="word-break: break-word">
      {{ message.text }}
    </div>
    <div v-if="message.type === 1">
      Channel Created
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import relativeTime from 'dayjs/plugin/relativeTime'
import dayjs from 'dayjs'

dayjs.extend(relativeTime)

@Component({
  name: 'MessageCell',
  props: [
    'message',
  ],
})
export default class MessageCell extends Vue {
  dayjs = dayjs
  timestamp = ''
  timestampUpdateTimer = null
  mounted() {
    if (this.message.from)
      this.$store.dispatch('loadIcon', this.message.from)
    this.updateTimestamp()
    this.timestampUpdateTimer = setInterval(() => {
      // update the timestamp
      this.updateTimestamp()
    }, 30 * 1000)
  }

  updateTimestamp() {
    this.timestamp = dayjs().to(dayjs(this.message.timestamp))
  }

  beforeUnmount() {
    if (this.timestampUpdateTimer) {
      clearTimeout(this.timestampUpdateTimer)
      this.timestampUpdateTimer = null
    }
  }

}
</script>

<style scoped>
.message-cell-container {
  border: 1px solid black;
  border-radius: 2px;
  padding: 4px;
  margin: 2px 0px;
}
.timestamp-text {
  font-size: 12px;
}
</style>
