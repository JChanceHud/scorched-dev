<template>
  <div>
    <div style="display: flex">
      Payment Amount:
      <EtherAmountField :amount="payment" v-model="payment" />
    </div>
    <div style="display: flex">
      Asker Burn Amount:
      <EtherAmountField :amount="askerBurn" v-model="askerBurn" />
    </div>
    <div style="display: flex">
      Suggester Burn Amount:
      <EtherAmountField :amount="suggesterBurn" v-model="suggesterBurn" />
    </div>
    <button v-on:click="submit">Submit</button>
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'
import { ethers } from 'ethers'
import EtherAmountField from './EtherAmountField'

@Component({
  name: 'NegotiateCell',
  components: { EtherAmountField, },
  props: ['onSubmit']
})
export default class NegotiateCell extends Vue {
  payment = '0.1'
  askerBurn = '0.05'
  suggesterBurn = '0.05'

  submit() {
    if (typeof this.onSubmit === 'function') {
      const { payment, askerBurn, suggesterBurn } = this
      this.onSubmit({
        payment: ethers.utils.parseEther(payment),
        askerBurn: ethers.utils.parseEther(askerBurn),
        suggesterBurn: ethers.utils.parseEther(suggesterBurn),
      })
    }
  }
}
</script>

<style scoped>
</style>
