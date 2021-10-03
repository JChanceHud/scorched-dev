<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'

@Component({
  name: 'App',
})
export default class App extends Vue {
  async mounted() {
    await this.$store.dispatch('load')
  }
}
</script>

<style>
body: {
  margin: 0px;
}
</style>
