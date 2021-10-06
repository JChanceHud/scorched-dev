import EspecialClient from 'especial/client'
import * as uuid from 'uuid'
import { signStates } from '@statechannels/nitro-protocol'

const SCORCHED_ADDRESS = '0x6e64a91e1F41bd069984716a806034881D5c9Da8'

export default {
  state: {
    connected: false,
    wsAddress: '',
    client: undefined,
    info: {},
    channels: [],
    channelsById: {},
    messagesByChannelId: {},
    auth: undefined,
  },
  mutations: {
    ingestMessages: (state, { channelId, messages: _messages }) => {
      // can pass a single message or an arry
      const messages = [_messages].flat()
      state.messagesByChannelId[channelId] = state.messagesByChannelId[channelId] || []
      const newMessages = [...state.messagesByChannelId[channelId], ...messages]
        .sort((a, b) => a.timestamp - b.timestamp)
      state.messagesByChannelId = {
        ...state.messagesByChannelId,
        [channelId]: newMessages,
      }
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
    authenticate: async ({ state, rootState, dispatch }) => {
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
        address: rootState.wallet.activeAddress,
      }
    },
    initChannel: async ({ state, dispatch, rootState }) => {
      if (!state.client || !state.connected) return
      const { data } = await state.client.send('channel.retrieve', {
        auth: state.auth,
      })
      state.channels = data
      state.channelsById = [...data].reduce((acc, channel) => {
        return { ...acc, [channel.id]: channel }
      }, {})
      for (const { id } of data) {
        await dispatch('loadChannelMessages', id)
      }
    },
    loadChannelMessages: async ({ state, commit, }, channelId) => {
      // subscribe to future messages
      const subscriptionId = uuid.v4()
      state.client.listen(subscriptionId, (err, { data }) => {
        commit('ingestMessages', {
          channelId: data.channelId,
          messages: data.message,
        })
      })
      const { data: subscription } = await state.client.send('channel.subscribe', {
        channelId,
        subscriptionId,
        auth: state.auth,
      })
      const { data: messages } = await state.client.send('channel.messages', {
        channelId,
        auth: state.auth,
      })
      commit('ingestMessages', {
        messages,
        channelId,
      })
    },
    sendMessage: async ({ state, rootState }, { text, channelId }) => {
      if (!state.connected) throw new Error('No valid connection')
      await state.client.send('channel.send', {
        channelId,
        auth: state.auth,
        message: {
          type: 0,
          text,
        }
      })
    },
    signAndSubmitState: async ({ rootState, state }, { channelId, state: _state }) => {
      const [signature] = await signStates(
        [_state],
        [rootState.wallet.signer],
        [0]
      )
      await state.client.send('channel.submitSignedState', {
        channelId,
        auth: state.auth,
        state: _state,
        signature,
      })
    }
  },
}
