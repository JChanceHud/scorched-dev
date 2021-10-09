<template>
  <input
    class="ether-input"
    :style="`
      ${amountState === 1 ? 'border: 2px solid green;' : ''}
      ${amountState === 2 ? 'border: 2px solid red;' : ''}
    `"
    type="text"
    :value="amount"
    v-on:input="amountChanged"
  />
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'

@Component({
  name: 'EtherAmountField',
  props: [
    'amount',
    'onChange',
    'maxAmount',
  ],
  model: {
    prop: 'amount',
    event: 'amountChanged',
  }
})
export default class EtherAmountField extends Vue {
  // 0 = nothing entered
  // 1 = valid
  // 2 = invalid
  amountState = 0

  mounted() {
    this.updateState(this.amount)
  }

  amountChanged(e) {
    this.$emit('amountChanged', e.target.value)
    this.updateState(e.target.value)
  }

  updateState(newVal) {
    if (newVal.length === 0 || +newVal === 0) {
      this.amountState = 0
    } else if (isNaN(newVal)) {
      this.amountState = 2
    } else {
      this.amountState = 1
    }
  }
}
</script>

<style scoped>
.ether-input {
  /* border: 1px solid #2A3D46; */
  border: 2px solid black;
}
.ether-input::placeholder {
  font-size: 14px;
  color: #95A7AE;
}
.ether-input:focus {
  outline: 0px;
}
</style>
