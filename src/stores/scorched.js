import EspecialClient from 'especial/client'
import * as uuid from 'uuid'

const SCORCHED_ADDRESS = '0xCAe4060F3d87Faca6506a49B12Ea94305E51a16d'

export default {
  state: {
    connected: false,
    wsAddress: '',
    client: undefined,
    info: {},
    channel: undefined,
    messages: [],
  },
  mutations: {
    ingestMessages: (state, _messages) => {
      // can pass a single message or an arry
      const messages = [_messages].flat()
      const newMessages = [...state.messages, ...messages]
        .sort((a, b) => a.timestamp - b.timestamp)
      state.messages = newMessages
    }
  },
  actions: {
    connect: async ({ state, dispatch }, url) => {
      if (state.connected) return console.log('Already connected')
      state.wsAddress = url
      try {
        state.client = new EspecialClient(state.wsAddress)
        await state.client.connect()
      } catch (err) {
        state.client = undefined
        return
      }
      state.connected = state.client.connected
      state.client.addConnectedHandler(() => {
        state.connected = state.client.connected
        if (!state.connected) {
          // clear the client, possibly attempt reconnect
          state.client = undefined
        }
      })
      const { data, message, status } = await state.client.send('info')
      state.info = data
      await dispatch('initChannel')
    },
    disconnect: async ({ state }, payload) => {
      if (!state.connected) return console.log('Not connected')
      state.client.disconnect()
      state.client = undefined
    },
    initChannel: async ({ state, commit, rootState }) => {
      if (!state.client || !state.connected) return
      const { data } = await state.client.send('channel.retrieve', {
        asker: rootState.wallet.activeAddress,
      })
      state.channel = data
      // subscribe to future messages
      const subscriptionId = uuid.v4()
      state.client.listen(subscriptionId, (err, { data }) => {
        commit('ingestMessages', data)
      })
      const { data: subscription } = await state.client.send('channel.subscribe', {
        owner: rootState.wallet.activeAddress,
        channelId: state.channel.id,
        subscriptionId,
      })
      const { data: messages } = await state.client.send('channel.messages', {
        asker: rootState.wallet.activeAddress,
        channelId: state.channel.id,
      })
      commit('ingestMessages', messages)
    },
    sendMessage: async ({ state, rootState }, text) => {
      if (!state.connected || !state.channel) throw new Error('No valid connection')
      await state.client.send('channel.send', {
        channelId: state.channel.id,
        message: {
          type: 0,
          text,
          from: rootState.wallet.activeAddress
        }
      })
    }
  },
}
