#Capsule

Capsule is an experimental web framework for node.js that uses socket.io and backbone to synchronize model state by sharing model code between the client and the server.

MIT Licensed.

##Introduction !important
I'm releasing Capsule in it's current state as a demonstration of one possible way to build realtime web apps. I've used it (or a similar variety) of it for a couple of apps. One of which our team uses everyday [&!](http://andbang.com).

Capsule presents and experimental approach to building real-time web apps that re-uses the exact same models on the server as what you serve in a script tag in the html of your app. For more information on this approach see my blog post on [Re-using Backbone.js Models on the server with Node.js and Socket.io to build realtime apps](http://andyet.net/blog/2011/feb/15/re-using-backbonejs-models-on-the-server-with-node/). It's also something I will discuss in in my upcoming talk at [NodeConf 2011](http://nodeconf.com/).

It's essentially a set of convenience methods and additions to @jashkenas's excellent Backbone.js lib. In it's current state it's a bit indulgent in that it makes quite a few assumptions about your app and could certainly stand to be more generic.

##Core assumptions are as follows:

- All synced state is stored in a root model which is kept in memory on the server (yes, this is obviously inefficient in some ways, but completely badass in others. Please don't tell me it won't scale we're also working on tying this into the completely aweseome thoonk.js redis lib that will use redis for clustering/scaling).
- Several of the methods in `Capsule.View` assume that you're also using [ICanHaz.js](http://icanhaz.js) and Mustache for your clientside templating.

##How to use it

1. Build your models file. You'll want something like this at the top to make it possible to use on the server and in the browser:

      if (typeof require == 'undefined') {
        var exports = window,
          server = false;
      } else {
        var Capsule = require('./capsule.models'),
          _ = require('underscore')._,
          server = true;
      }


2. Then add your root model that contains any child models or collections.
        
      exports.AppModel = Capsule.Model.extend({
        type: 'app',
        initialize: function (spec) {
          this.register();
          this.addChildCollection('members', exports.Members);
          this.addChildModel('activityLog', exports.ActivityLogPage);
        }
      });

3. Set up socket.io and your node server. Here's the core of the socket.io event handlers.
   
      socket.on('connection', function (client) {
        var app, sessionId;
          
        // this is split out so we have a reference to it we can
        // bind and unbind on disconnect.
        function sendClientChanges(changes) {
          client.send(changes);
        }
          
        // I blast out the client templates this way, just cause we can.
        client.send({
          event: 'templates',
          templates: templates
        });
          
        client.on('disconnect', function () {
          if (app) app.unbind('publish', sendClientChanges);
        });
          
        client.on('message', function(message){
          var model, collection;
          
          switch (message.event) {
            case 'session':
               ...
                  
               // Here you'd get user based on sessionid
               // you'd also get the corresponding app state that they should have access to.
               // `require` you shared models file and inflate or instantiate your root app model
               // Then grab whatever else you need and send the intial state to the client.
               client.send({
                 event: 'initial',
                 app: app.xport()
               });
                      
               // bind to the root `publish` events to send any changes to this client
               app.bind('publish', sendClientChanges);
                      
               ...
                      
              break;
            case 'set':
              // obviously we want to secure this, to make sure they're allowed
              // to edit what they're editing
              app.modelGetter(message.id).set(message.change);
              break;
            case 'delete':
              model = app.modelGetter(message.id);
              if (model && model.collection) model.collection.remove(model);
              break;
            case 'add':
              collection = app.modelGetter(message.id);
              if (collection) collection.add(message.data);
              break;
          }
        });
      });
    
4. In your client code. Do something like this.
  
      $(function () {
        // init our empty AppModel
        var app = window.app = new AppModel(),
          view = window.view = {},
          server;
          
        window.socket = new io.Socket();
          
        // get and send our session cookie (yes, i know httponly cookies would be more secure, but whatever it's demo)
        socket.on('connect', function() { 
          socket.send({event: 'session', cookie: $.cookie('&!')});
          console.log('connected');
        });
          
        socket.on('message', function (data) { 
          var changedModel, template;
          
          console.log('RECD:', data);
          
          switch (data.event) {
            case 'templates':
              for (template in data.templates) {
                ich.addTemplate(template, data.templates[template]);
              }
              break;
            case 'initial':
              //import app state
              app.mport(data.app);
              
              // init our root view
              view = window.view = new AppView({
                el: $('body'),
                model: app
              });
              
              view.render();
              break;
            case 'change':
              changedModel = Capsule.models[data.id];
              if (changedModel) {
                changedModel.set(data.data);
              } else {
                console.error('model not found for change event', data);
              }
              break;
            case 'add':
              Capsule.models[data.collection].add(data.data.attrs);
              break;
            case 'remove':
              changedModel = Capsule.models[data.id];
              if (changedModel && changedModel.collection) {
                changedModel.collection.remove(changedModel);
              }
              break;
          }
        });
      });

