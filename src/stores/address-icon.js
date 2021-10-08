import makeBlockie from 'ethereum-blockies-base64'

export default {
  state: {
    iconsByAddress: {}
  },
  actions: {
    loadIcon: ({ state }, address) => {
      state.iconsByAddress = {
        ...state.iconsByAddress,
        [address]: (state.iconsByAddress[address] || makeBlockie(address))
      }
      return state.iconsByAddress[address]
    }
  }
}
