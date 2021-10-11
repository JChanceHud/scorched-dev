<template>
  <Popup :onCancel="onCancel" :visible="visible">
    <div style="font-size: 18px; font-weight: bold">
      Registered Suggesters
    </div>
    <div
      v-for="suggester of $store.state.market.suggesters"
      style="border: 1px solid black; padding: 4px; display: flex; flex-direction: column; align-items: center"
    >
    <div style="display: flex">
      <img width="32" :src="$store.state.icon.iconsByAddress[suggester.address]" />
      <div spacer style="width: 4px" />
      <div>
        <div>Name: {{ suggester.name }}</div>
        <div>Bio: {{ suggester.bio }}</div>
      </div>
    </div>
    <div spacer style="height: 4px" />
    <button v-on:click="createChannel(suggester.address)">Create Channel</button>
    </div>
  </Popup>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import Popup from './Popup'

@Component({
  name: 'SuggesterMarket',
  components: { Popup, },
  props: ['visible', 'onCancel', 'onCreateChannel']
})
export default class SuggesterMarket extends Vue {
  async createChannel(suggesterAddress) {
    if (typeof this.onCreateChannel === 'function') {
      this.onCreateChannel(suggesterAddress)
    }
  }
}
</script>

<style scoped>
</style>
