import EspecialClient from 'especial/client'
import * as uuid from 'uuid'
import {
  signStates,
  getFixedPart,
  getVariablePart,
} from '@statechannels/nitro-protocol'
import { ethers } from 'ethers'
import {
  ScorchedABI,
  AdjudicatorABI,
} from 'scorched'

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
    },
    ingestState: (state, { channelId, state: _state, signature }) => {
      const channel = state.channels.find(({ id }) => id === channelId)
      if (!channel) throw new Error('Unable to find channel')
      channel.states.push(_state)
      channel.signatures.push(signature)
      state.channelsById = {
        ...state.channelsById,
        [channelId]: channel,
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
      dispatch('loadIcon', state.info.suggester, { root: true })
      dispatch('loadIcon', ethers.constants.AddressZero, { root: true })
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
      for (const channel of state.channels) {
        for (const participant of channel.participants) {
          dispatch('loadIcon', participant, { root: true })
        }
      }
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
        const { message, state: _state, signature, balances } = data
        if (message) {
          commit('ingestMessages', {
            channelId: data.channelId,
            messages: data.message,
          })
        }
        if (_state && signature) {
          commit('ingestState', { channelId, state: _state, signature })
        }
        if (balances) {
          state.channelsById = {
            ...state.channelsById,
            [data.channelId]: {
              ...state.channelsById[data.channelId],
              balances,
            }
          }
          // a deposit occured, reload
        }
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
    },
    createCheckpoint: async ({ rootState, state }, channelId) => {
      // we'll use the latest two states
      const channel = state.channelsById[channelId]
      if (!channel) throw new Error(`Unable to find channel by id "${channelId}"`)
      if (channel.states.length !== channel.signatures.length)
        throw new Error(`Mismatch between states length and signatures length`)
      if (channel.states.length < 2)
        throw new Error(`Not enough states to create checkpoint`)
      const states = channel.states.slice(-2)
      const signatures = channel.signatures.slice(-2)
      const whoSignedWhat = []
      const orderedSignatures = []
      if (states[0].turnNum % 2 === 0) {
        whoSignedWhat.push(0, 1)
        orderedSignatures.push(...signatures)
      } else {
        whoSignedWhat.push(1, 0)
        orderedSignatures.push(...signatures.reverse())
      }
      const { baseState } = channel
      const contractAddress = baseState.appDefinition
      const contract = new ethers.Contract(contractAddress, ScorchedABI, rootState.wallet.signer)
      const adjudicatorAddress = await contract.assetHolder()
      const adjudicator = new ethers.Contract(adjudicatorAddress, AdjudicatorABI, rootState.wallet.signer)
      const tx = await adjudicator.checkpoint(
        getFixedPart(states[1]),
        states[1].turnNum,
        states.map((s) => getVariablePart(s)),
        0,
        orderedSignatures,
        whoSignedWhat,
      )
      await tx.wait()
    }
  },
}
