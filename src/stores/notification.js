export default {
  state: {
    pageVisible: true,
  },
  mutations: {},
  actions: {
    load: async ({ state, commit }) => {
      document.addEventListener('visibilitychange', () => {
        state.pageVisible = !document.hidden
      })
    },
    requestNotificationPermission: async ({ state }) => {
      if (Notification.permission === 'default') {
        await Notification.requestPermission()
      }
    },
    postNotification: async ({ state }, message) => {
      if (state.pageVisible) return
      if (!window.Notification) return
      if (Notification.permission !== 'granted') return
      new Notification('Scorched Earth', {
        body: message,
      })
    }
  }
}
