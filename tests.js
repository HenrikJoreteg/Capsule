// you can run these tests with the nodeunit test runner

capsule = require('../capsule');

var Person = capsule.Model.extend({
    type: 'person',
    exposedServerMethods: ['dance'],
    initialize: function () {
        this.register();
    },
    dance: function () {
        this.set({bodyMovin: "dancin'"});
    },
    stopDancing: function () {
        this.set({bodyMoving: 'stopped'});
    },
    canEdit: function (user) {
        return user === this;
    }
});

var Comment = capsule.Model.extend({
    type: 'comment',
    initialize: function () {
        this.register();
    }
});

var Comments = capsule.Collection.extend({
    type: 'comments',
    model: Comment,
    initialize: function () {
        this.register();
    },
    canMove: function (user) {
        return this.parent.collection.parent.author === user;
    }
});

var Post = capsule.Model.extend({
    type: 'post',
    clientEditable: ['title'],
    initialize: function () {
        this.register();
        this.addChildCollection('comments', Comments);
    },
    canEdit: function (user) {
        return this.collection.parent.author === user;    
    }
});

var Posts = capsule.Collection.extend({
    type: 'posts',
    model: Post,
    initialize: function () {
        this.register();
    }
});

var RootModel = capsule.Model.extend({
    type: 'app',
    initialize: function () {
        this.register();
        this.addChildCollection('posts', Posts);
        this.addChildModel('author', Person);
    }
});

function getApp() {
    var app = new RootModel();
    app.author.set({name: 'henrik'});
    app.posts.add(new Post({title: 'some post'}));
    
    app.posts.first().comments.add({subject: 'first', body: 'something else'});
    
    return app;
};

exports.testXportImport = function (test) {
    var app1 = getApp();
    var app2 = new RootModel();
    test.ok(app1);
    // import the export of app1 into app2
    app2.mport(app1.xport());
    test.deepEqual(app1.xport(), app2.xport());
    // reimporting shouldn't make a difference
    app2.mport(app1.xport());
    test.deepEqual(app1.xport(), app2.xport());
    test.done();
};

exports.testChangeEventBubbling = function (test) {
    var app = getApp();
    app.bind('publish', function (e) {
        test.equal(e.event, 'change');
        test.ok(e.id);
        test.equal(e.data.hello, true);
        test.done();
    });
    // do something to trigger an event in a nested model
    app.posts.first().comments.first().set({hello: true});
};

exports.testAddEventBubbling = function (test) {
    var app = getApp();
    app.bind('publish', function (e) {
        test.equal(e.event, 'add');
        test.ok(e.collection)
        test.equal(e.data.attrs.subject, 'something');
        test.done();
    });
    // do something to trigger an event in a nested model
    app.posts.first().comments.add({subject: 'something', body: 'something else'});
};

exports.testRemoveEventBubbling = function (test) {
    var app = getApp();
    app.bind('publish', function (e) {
        test.equal(e.event, 'remove');
        test.ok(e.id);
        test.done();
    });
    // do something to trigger an event in a nested model
    app.posts.first().comments.remove(app.posts.first().comments.first());
};

exports.testMoveEventBubbling = function (test) {
    var app = getApp();
    var com1 = new Comment({subject: 'second'});
    var com2 = new Comment({subject: 'third'});
    var comments = app.posts.first().comments;
    comments.add(com1);
    comments.add(com2);
    
    app.bind('publish', function (e) {
        test.equal(e.event, 'move');
        test.equal(e.collection, comments.id);
        test.equal(e.id, com2.id);
        test.equal(e.newPosition, 0);
        test.done();
    });
    
    comments.moveItem(com2.id, 0);
};

exports.testSafeSet = function (test) {
    var app = getApp();
    var post = new Post({title: 'some post'});
    app.author.set({name: 'henrik'});
    app.posts.add(post);
    var author = app.author;
    
    // the author should be able to set the title
    post.safeSet({title: 'something'}, author);
    test.equal(post.get('title'), 'something');
    
    // the author should not be able to set other properties
    post.safeSet({description: 'some other post'}, author, function (type, user, attrs) {
        test.equal(type, 'set');
        test.equal(user, author);
        test.done();
    });
};


exports.testSafeDelete = function (test) {
    var app = getApp();
    var post = new Post({title: 'some post'});
    var post2 = new Post({title: 'some other post'});
    app.author.set({name: 'henrik'});
    app.posts.add(post);
    app.posts.add(post2);
    var author = app.author;
    
    // the author should be able to delete it
    test.equal(app.posts.length, 3);
    post2.safeDelete(author);
    test.equal(app.posts.length, 2);
    
    // an other user should not be able to delete
    var randomUser = new Person({name: 'henrik'});
    post.safeDelete(randomUser, function (type, user, model) {
        test.equal(type, 'delete');
        test.equal(randomUser, user);
        test.equal(app.posts.length, 2);
        test.equal('test', 'test');
        test.done();
    });
};


exports.testSafeMoveStopped = function (test) {
    var app = getApp();
    var com1 = new Comment({subject: 'second'});
    var com2 = new Comment({subject: 'third'});
    var comments = app.posts.first().comments;
    comments.add(com1);
    comments.add(com2);
    var randomPerson = new Person({name: 'someone'});
    
    // should not work
    comments.safeMove(com2.id, 0, randomPerson, function (type, user, id, newPosition) {
        test.equal(type, 'move');
        test.equal(user, randomPerson);
        test.equal(id, com2.id);
        test.equal(newPosition, 0);
        test.done();
    });
};

exports.testSafeMoveSuccessful = function (test) {
    var app = getApp();
    var com1 = new Comment({subject: 'second'});
    var com2 = new Comment({subject: 'third'});
    var comments = app.posts.first().comments;
    comments.add(com1);
    comments.add(com2);
    
    // should not work
    comments.safeMove(com2.id, 0, app.author);
    test.equal(comments.models.indexOf(com2), 0);
    test.done();
};

exports.testSafeCall = function (test) {
    var app = getApp();
    var u = app.author;
    test.ok(!u.get('bodyMovin'), "starts out as undefined");
    u.safeCall('dance', new Person({name: "Mr. Shady"}));
    test.ok(!u.get('bodyMovin'), "nothing should have happened");
    u.safeCall('dance', u);
    test.equal(u.get('bodyMovin'), "dancin'", "now he's dancin'!");
    u.safeCall('stopDancing', u);
    test.equal(u.get('bodyMovin'), "dancin'", "that's right... he can't even make himself stop dancing");
    
    u.safeCall('stopDancing', u, function (type, user, method, model) {
        test.equal(type, 'call');
        test.equal(user, u);
        test.equal(method, 'stopDancing');
        test.equal(model, u);
        test.done();
    });
};