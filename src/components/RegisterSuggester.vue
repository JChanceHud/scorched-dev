<template>
  <Popup :visible="visible" :onCancel="onCancel">
    <div style="font-size: 18px; font-weight: bold">
      Register as a Suggester
    </div>
    <input type="text" v-model="name" placeholder="suggester name" />
    <input type="text" v-model="bio" placeholder="suggester bio" />
    <button v-on:click="register">Register</button>
  </Popup>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import Popup from './Popup'

@Component({
  name: 'RegisterSuggester',
  components: { Popup, },
  props: ['visible', 'onCancel'],
})
export default class RegisterSuggester extends Vue {
  name = ''
  bio = ''

  async register() {
    try {
      await this.$store.dispatch('registerSuggester', {
        bio: this.bio,
        name: this.name,
      })
    } catch (err) {
      console.log(err)
    }
  }
}
</script>

<style scoped>
</style>
