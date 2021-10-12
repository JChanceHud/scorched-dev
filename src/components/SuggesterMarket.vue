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
    <div v-if="suggester.address === $store.state.wallet.activeAddress">
      <div style="display: flex">
        <input type="text" v-model="newName" :placeholder="suggester.name" />
        <button v-on:click="updateName">Update</button>
      </div>
      <div style="display: flex">
        <input type="text" v-model="newBio" :placeholder="suggester.bio" />
        <button v-on:click="updateBio">Update</button>
      </div>
    </div>
    </div>
  </Popup>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import Popup from './Popup'
import { ethers } from 'ethers'
import { ScorchedMarketABI } from 'scorched'

@Component({
  name: 'SuggesterMarket',
  components: { Popup, },
  props: ['visible', 'onCancel', 'onCreateChannel']
})
export default class SuggesterMarket extends Vue {
  newName = ''
  newBio = ''

  async updateName() {
    const { marketAddress } = this.$store.state.market
    const market = new ethers.Contract(marketAddress, ScorchedMarketABI, this.$store.state.wallet.signer)
    const tx = await market.updateName(this.newName)
    await tx.wait()
    this.newName = ''
    await this.$store.dispatch('loadSuggesters')
  }

  async updateBio() {
    const { marketAddress } = this.$store.state.market
    const market = new ethers.Contract(marketAddress, ScorchedMarketABI, this.$store.state.wallet.signer)
    const tx = await market.updateBio(this.newBio)
    await tx.wait()
    this.newBio = ''
    await this.$store.dispatch('loadSuggesters')
  }

  async createChannel(suggesterAddress) {
    if (typeof this.onCreateChannel === 'function') {
      this.onCreateChannel(suggesterAddress)
    }
  }
}
</script>

<style scoped>
</style>
