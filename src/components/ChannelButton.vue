<template>
  <div class="channel-button-container" v-on:click="$emit('click')">
    <div style="display: flex">
      <div>Asker:</div>
      <div spacer style="width: 4px" />
      <img
        v-if="!nameForAsker"
        width="16"
        height="auto"
        :src="$store.state.icon.iconsByAddress[channel.participants[0]]"
      />
      <div v-if="nameForAsker">{{ nameForAsker }}</div>
    </div>
    <div style="display: flex">
      <div>Suggester:</div>
      <div spacer style="width: 4px" />
      <img
        v-if="!nameForSuggester"
        width="16"
        height="auto"
        :src="$store.state.icon.iconsByAddress[channel.participants[1]]"
      />
      <div v-if="nameForSuggester">{{ nameForSuggester }}</div>
    </div>
    <div v-if="channel.unreadCount > 0" class="unread-badge">
      {{ channel.unreadCount }}
    </div>
  </div>
</template>

<script>
import Vue from 'vue'
import Component from 'vue-class-component'

@Component({
  name: 'ChannelButton',
  props: ['channelId'],
  computed: {
    channel: function () {
      return this.$store.state.scorched.channelsById[this.channelId]
    },
    nameForAsker: function () {
      const [ asker ] = this.channel.participants
      if (asker === this.$store.state.wallet.activeAddress) {
        return '(me)'
      } else if (this.$store.state.market.suggestersByAddress[asker]) {
        return this.$store.state.market.suggestersByAddress[asker].name
      }
    },
    nameForSuggester: function () {
      const [ , suggester ] = this.channel.participants
      if (suggester === this.$store.state.wallet.activeAddress) {
        return '(me)'
      } else if (this.$store.state.market.suggestersByAddress[suggester]) {
        return this.$store.state.market.suggestersByAddress[suggester].name
      }
    }
  }
})
export default class ChannelButton extends Vue {

}
</script>

<style scoped>
.channel-button-container {
  background: #aaaaff;
  padding: 4px;
  margin: 2px;
  cursor: pointer;
  position: relative;
}
.unread-badge {
  background: red;
  border-radius: 5px;
  padding: 2px 4px;
  color: white;
  position: absolute;
  top: -5px;
  left: calc(100% - 20px);
}
</style>
