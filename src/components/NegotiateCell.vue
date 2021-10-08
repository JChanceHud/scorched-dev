<template>
  <div>
    <div style="display: flex">
      Payment Amount: <input type="text" v-model="payment" />
    </div>
    <div style="display: flex">
      Asker Burn Amount: <input type="text" v-model="askerBurn" />
    </div>
    <div style="display: flex">
      Suggester Burn Amount: <input type="text" v-model="suggesterBurn" />
    </div>
    <button v-on:click="submit">Submit</button>
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'

@Component({
  name: 'NegotiateCell',
  props: ['onSubmit']
})
export default class NegotiateCell extends Vue {
  payment = '10'
  askerBurn = '5'
  suggesterBurn = '5'

  submit() {
    if (typeof this.onSubmit === 'function') {
      const { payment, askerBurn, suggesterBurn } = this
      this.onSubmit({ payment, askerBurn, suggesterBurn })
    }
  }
}
</script>

<style scoped>
</style>
