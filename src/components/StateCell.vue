<template>
  <div class="state-cell-container">
    <!-- <div v-if="state.type === 0" style="word-break: break-word">
      {{ message.text }}
    </div> -->
    <div style="display: flex; align-items: center; justify-content: space-between">
      <div style="font-weight: bold; font-size: 21px">
        Turn #{{ state.turnNum }}
      </div>
    </div>
    <div v-if="state">
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
    'state',
  ],
})
export default class MessageCell extends Vue {
  dayjs = dayjs
  mounted() {
    console.log(this.state)
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
