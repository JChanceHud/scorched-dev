<template>
  <div class="message-cell-container">
    <div class="timestamp-text">
      {{ dayjs().to(dayjs(message.timestamp)) }}
    </div>
    <div v-if="message.type === 0">
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
}
</script>

<style scoped>
.message-cell-container {
  border: 1px solid black;
  border-radius: 2px;
  padding: 4px;
}
.timestamp-text {
  font-size: 12px;
}
</style>
