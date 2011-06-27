#Capsule

Capsule is an experimental web framework by [@HenrikJoreteg](http://twitter.com/HenrikJoreteg) for Node.js that uses Socket.io and Backbone.js to synchronize model state by sharing model code between the client and the server.

    $ npm install capsule

MIT Licensed.
    
##Introduction !important

Capsule presents and experimental approach to building real-time web apps that re-uses the exact same models on the server as what you serve in a script tag in the html of your app. I've used this approach for a couple of apps, one of which our team uses everyday.

For more information on this approach see my blog post on [Re-using Backbone.js Models on the server with Node.js and Socket.io to build realtime apps](http://andyet.net/blog/2011/feb/15/re-using-backbonejs-models-on-the-server-with-node/). It's also something I will discuss it in my upcoming talk at [NodeConf 2011](http://nodeconf.com/).

It's essentially a set of convenience methods and additions to [@jashkenas](http://twitter.com/jashkenas)'s excellent [Backbone.js](http://documentcloud.github.com/backbone/) lib. In it's current state Capsule is a bit indulgent in that it makes quite a few assumptions about your app and could certainly stand to be more generic.

##Core assumptions are as follows:

- All synced state is stored in a root model which is kept in memory on the server (yes, this is inefficient in some ways, but completely badass in others. Please don't tell me it won't scale we're also working on tying this into [@fritzy](http://twitter.com/fritzy)'s awesome upcoming thoonk.js redis lib that will use redis for clustering/scaling).
- Several of the methods in `Capsule.View` assume that you're also using [ICanHaz.js](http://icanhazjs.com) and Mustache for your clientside templating.

##How to use it

The annotated source serves as temporary API documentation of what the code is capable of. You should read it as well, before you attempt to use this:

- [capsule.js annotated source](http://andyet.github.com/Capsule/)

Here's how you'd start building an app based on this method:

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


##Comments

I'd love to get feedback and/or pull requests on this. Or, hit me up on twitter [@HenrikJoreteg](http://twitter.com/HenrikJoreteg).

##Roadmap

- Starting point/convenience methods for required server and client setups described above.
- Scaling questions: One big limitation of this approach in its current state is scaling. This library will be converted to use [Thoonk.js](https://github.com/andyet/Thoonk.js) to leverage Redis's clustering and pub/sub capabilities as a back end.
- Better handling of offline support/flaky connections: Potentially one could build a `changes` queue of events if the connection is lost and then send those on reconnect.
- Better/easier way to handle security instead of having to validate each message outside of the model structure on the server.
- Full sample app (I've built stuff with this, but not opensourceable apps)
- More awesome


##Change Log
- 0.2.2 
  - fixed bug in error callback code
  - added support for `templateHelpers` in views
  - improved test for enviroment (server/client)
  - better handling if used as CommonJS module in a browser

