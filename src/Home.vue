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
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import { ethers } from 'ethers'
import { ScorchedABI } from 'scorched'

@Component({
  name: 'Home',
  components: {},
  metaInfo: {
    title: 'Scorched dev',
  },
})
export default class Home extends Vue {
  suggesterUrl = ''

  async connect() {
    await this.$store.dispatch('connect', this.suggesterUrl)
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
