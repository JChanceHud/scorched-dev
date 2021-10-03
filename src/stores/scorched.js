import EspecialClient from 'especial/client'

const SCORCHED_ADDRESS = '0xCAe4060F3d87Faca6506a49B12Ea94305E51a16d'

export default {
  state: {
    connected: false,
    wsAddress: '',
    client: undefined,
    info: {},
  },
  mutations: {},
  actions: {
    connect: async ({ state }, url) => {
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
      console.log(data)
      state.info = data
    },
    disconnect: async ({ state }, payload) => {
      if (!state.connected) return console.log('Not connected')
      state.client.disconnect()
      state.client = undefined
    }
  },
}
