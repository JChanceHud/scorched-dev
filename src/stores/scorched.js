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
    auth: undefined,
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
      await dispatch('authenticate')
      // get the authentication string
      await dispatch('initChannel')
    },
    disconnect: async ({ state }, payload) => {
      if (!state.connected) return console.log('Not connected')
      state.client.disconnect()
      state.client = undefined
    },
    authenticate: async ({ state, dispatch }) => {
      const timestamp = `${+new Date()}`
      const msgParams = {
        domain: {
          chainId: 5,
          name: 'Scorched Auth',
          version: '0',
        },
        value: {
          info: 'Authenticate',
          details: 'Sign this message to authenticate with the suggester server',
          timestamp,
        },
        primaryType: 'ScorchedAuth',
        types: {
          ScorchedAuth: [
            { name: 'info', type: 'string', },
            { name: 'details', type: 'string', },
            { name: 'timestamp', type: 'string', },
          ]
        }
      }
      const signature = await dispatch('sign', msgParams, { root: true })
      state.auth = {
        signature,
        timestamp,
      }
    },
    initChannel: async ({ state, commit, rootState }) => {
      if (!state.client || !state.connected) return
      const { data } = await state.client.send('channel.retrieve', {
        auth: state.auth,
      })
      state.channel = data
      // subscribe to future messages
      const subscriptionId = uuid.v4()
      state.client.listen(subscriptionId, (err, { data }) => {
        commit('ingestMessages', data)
      })
      const { data: subscription } = await state.client.send('channel.subscribe', {
        channelId: state.channel.id,
        subscriptionId,
        auth: state.auth,
      })
      const { data: messages } = await state.client.send('channel.messages', {
        channelId: state.channel.id,
        auth: state.auth,
      })
      commit('ingestMessages', messages)
    },
    sendMessage: async ({ state, rootState }, text) => {
      if (!state.connected || !state.channel) throw new Error('No valid connection')
      await state.client.send('channel.send', {
        channelId: state.channel.id,
        auth: state.auth,
        message: {
          type: 0,
          text,
        }
      })
    }
  },
}
