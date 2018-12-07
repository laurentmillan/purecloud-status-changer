/*
  Créé par Laurent Millan <laurent.millan@genesys.com>
*/

const app = new Vue({
  el: '#app',
  data: {
    platformClient: require('platformClient'),
    client: null,
    groups: [],
    selectedGroupName: null,
    selectedGroup: null,
    users: []
  },
  watch: {
    selectedGroupName(g1, g2){
      this.selectedGroup = this.groups.find(g => g1 == g.name);

      // Obtenir tous les meebres du groupe et leur présence
      const groupsApi = new this.platformClient.GroupsApi();
      groupsApi.getGroupMembers(this.selectedGroup.id, {"pageSize": 200, expand: ["presence"]})
      .then(members => {
        this.users = members.entities
      })

      // Je démarre un canal de notification sur chacun des utilisateurs de la queue
      let self = this;
      const notificationApi = new this.platformClient.NotificationsApi();
      notificationApi.postNotificationsChannels().then( channel => {
        // J'ouvre la websocket de notification
        this.notificationsSocket = new WebSocket(channel.connectUri);
        this.notificationsSocket.onopen = function(){
          let subscriptions = self.users.map(user => {
            return {id: `v2.users.${user.id}.presence`}
          })
          // Je souscrit aux notifications (la présence de chaque utilisateur)
          notificationApi.postNotificationsChannelSubscriptions(channel.id, subscriptions)
        }

        // J'attache la method "onMessage" de la vue à la méthode onmessage de la websocket
        this.notificationsSocket.onmessage = this.onMessage
      })
    }
  },
  computed: {},
  methods: {
    getUserImage(user) {
      // Retourne le lien de l'image du user passé en paramètres
      if(!user.images){
        return "https://dhqbrvplips7x.cloudfront.net/directory/4447/assets/images/svg/person.svg"
      }
      else {
        return user.images[0].imageUri;
      }
    },
    setUserOffline(user){
      const presenceApi = new this.platformClient.PresenceApi();
      presenceApi.patchUserPresence(user.id, "PURECLOUD", {
        "name": "Offline",
        "source": "PURECLOUD",
        "primary": true,
        "presenceDefinition": {
          "id": "ccf3c10a-aa2c-4845-8e8d-f59fa48c58e5", // Ici l'id du status "Offline" propre à l'organisation
          "systemPresence": "Offline"
        }
      }).then(up => {
        console.log(up);
      })
    },
    getStatusClass(user){
      // Retourne la classe qui doit être utilisée pour afficher le cercle de couleur représentant la présence
      return "presence_" + user.presence.presenceDefinition.systemPresence.replace(/[ ]*/gi, "").toLowerCase();
    },
    onMessage(message) {
      // Réception d'un message de notification PureCloud
      var data = JSON.parse(message.data);
      if(data.topicName.match(/v2\.users\..*\.presence/gi)){
        // Si le message concerne la présence d'un user
        let userId = data.topicName.split(/v2\.users\.(.*)\.presence/gi)[1];
        this.users.forEach(u => {
          // On recherche le user dont on vient de recevoir la notification de présence
          if(u.id == userId){
            // On évite un problème du "on queue" qui peut apparaitre différemment dans les notifications
            if(u.presence.presenceDefinition.systemPresence.toLowerCase() == "on_queue"){
              u.presence.presenceDefinition.systemPresence = "onqueue";
            }
            // On change la présence du user
            u.presence = data.eventBody;
          }
        })
      }
    },
  },
  created() {
    this.client = this.platformClient.ApiClient.instance;
    this.client.setEnvironment('mypurecloud.ie');
    this.client.setPersistSettings(true);

    this.client.loginImplicitGrant("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "https://mondomaine/index.html")
    .then(data => {
      //use that session to interface with the API
      this.platformClient.ApiClient.instance.authentications['PureCloud Auth'].accessToken = data.accessToken;

      let groupsApi = new this.platformClient.GroupsApi();
      return groupsApi.getGroups({"pageSize": 200})
    })
    .then( groups => {
      this.groups = groups.entities
    })
    .catch(err => {
      // Handle failure response
      console.log(err);
    });
  }
})
