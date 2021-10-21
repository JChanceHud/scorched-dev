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
    await Promise.all([
      this.$store.dispatch('loadSuggesters'),
      this.$store.dispatch('connect'),
    ])
  }
}
</script>

<style>
body {
  font-family: sans-serif;
}
</style>
