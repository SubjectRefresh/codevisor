/*
    (c) 2015 Finnian Anderson. All rights reserved.
*/

var config = require("./config.js");
var io, socket_end_point;
var extensions = require("./modules/extensions/index.js");
var fs = require("fs");

var express = require("express");
var app = express();
var http = require("http").Server(app);
var sha1 = require("sha1");
var request = require("request");
var cheerio = require('cheerio');

if (config.production) {
    io = require("socket.io")(http, {
        path: '/socket.io'
    });
    config.socket = {
        path: '/codevisor/socket.io'
    };
} else {
    io = require("socket.io")(http);
    config.socket = {};
}

var mongoose = require("mongoose");

var ObjectId = require('mongoose').Types.ObjectId;

// Schema

var pageSchema = mongoose.Schema({
    owner: String, // owner of repository
    repo: String, // repository
    head: String, // branch
    styles: Object, // page styles
    tree: Object, // cache of tree 
    commits: Object, // cache of commits
    contributors: Object, // cache of contributors
    sockets: Array // currently connected sockets and their preferences
});

var Page = mongoose.model("page", pageSchema);

mongoose.connect('mongodb://localhost:27017/codevisor');
var db = mongoose.connection;
db.on('error', function(callback) {
    console.log("[CodeVisor] Error Connecting to MongoDB");
});
db.once('open', function(callback) {
    console.log("[CodeVisor] Connected to MongoDB");
});

app.use("/", express.static(__dirname + "/static"));

app.get("/get_config", function(req, res) {
    res.json(config);
});

app.push("/hooks/*", function(req, res) {
    var data = req.body;
    Page.findOne({
        owner: data.organization.login.toLowerCase(),
        repo: data.repository.name.toLowerCase()
    }, function(err, page) {
        if (err) console.log(err);

        if (page) {
            for (var i = 0; i < page.sockets.length; i++) {
                console.log("Notifying socket " + page.sockets[i].id + " about a commit for " + data.repository.full_name);
                io.to(page.sockets[i].id).emit('commits', data.commits); // if this fails, we need to remove this socket from page.sockets in the DB
            }
            if (page.sockets.length > 0) {
                console.log("No connected sockets for " + data.repository.full_name);

            }
        } else {
            console.log("No page for " + data.repository.full_name);
        }
    });
    res.json({
        message: "Thanks GitHub, we've notified all the users!"
    });
});

app.get("/p/*", function(req, res) {
    res.redirect("/");
    //     // what follows is probably really really bad code and uses practises frowned upon by the Node Gods
    //     console.log("Repo page requested for " + req.params[0]);
    //     var splitParam = req.params[0].split("/")
    //     var owner = splitParam[0];
    //     var repo = splitParam[1];
    //     Page.findOne({
    //         "owner": owner,
    //         "repo": repo
    //     }, function(err, doc) {
    //         if (err) console.log(err);
    //         if (doc) {
    //             fs.readFile(__dirname + '/static/index.html', 'utf8', function(err, html) {
    //                 // prevent the url rewriting that we use in the front end
    //                 $ = cheerio.load(html);
    //                 $("body").find("script").each(function() {
    //                     if ($(this).data("name") == "main") {
    //                         $(this).text("var doNotChangeURL=true;" + $(this).text());
    //                     }
    //                 });
    //                 res.send($.html());
    //             });
    //         } else {
    //             res.status(404).send('Sorry, that page could not be found!');
    //         }
    //     });
});

io.on("connection", function(socket) {
    socket.on("disconnect", function() {
        Page.findOne({
            "sockets.id": socket.id
        }, function(err, page) {
            if (err) console.log(err);
            if (page) {
                console.log(page);
                for (var i = 0; i < page.sockets.length; i++) {
                    if (page.sockets[i].id == socket.id) {
                        Page.update({
                            _id: ObjectId(page._id)
                        }, {
                            $pull: {
                                sockets: {
                                    id: socket.id
                                }
                            }
                        }); // in the future, this needs to work
                        break;
                    }
                }
            }
        });
    });
    socket.on("get heads", function(packet) {
        var urlRegExp = /^((ht|f)tps?:\/\/|)[a-z0-9-\.]+\.[a-z]{2,4}\/?([^\s<>\#%"\,\{\}\\|\\\^\[\]`]+)?$/;

        if (!packet.url || urlRegExp.test(packet.url.match)) {
            socket.emit("e", {
                message: "Invalid URL"
            });
        } else {
            if (packet.url.indexOf("github.com") !== -1) {
                var splitted = packet.url.split("/");
                var owner = splitted[1];
                var repo = splitted[2];
                request({
                    url: "https://api.github.com/repos/" + owner + "/" + repo + "/git/refs/heads",
                    headers: {
                        "User-Agent": "CodeVisor"
                    }
                }, function(error, response, body) {
                    if (!error && (response.statusCode == 200 || response.statusCode == 403)) {
                        socket.emit("head list", {
                            status: true,
                            heads: JSON.parse(body),
                            owner: owner,
                            repo: repo
                        });
                    } else {
                        if (response.statusCode == 404) {
                            socket.emit("head list", {
                                status: false,
                                message: "Repository not found"
                            });
                        } else {
                            socket.emit("head list", {
                                status: false,
                                message: "Unknown error"
                            });
                        }
                    }
                });
            } else {
                socket.emit("head list", {
                    status: false,
                    message: "Unsupported host"
                });
            }
        }
    });

    socket.on("repo page", function(packet) {
        var page;
        Page.findOne({
            "owner": packet.owner,
            "repo": packet.repo
        }, function(err, doc) {
            if (err) console.log(err);
            if (doc) {
                doc.sockets.push({
                    push: true,
                    id: socket.id
                });
                doc.save();
                page = doc;
                socket.emit("repo page", {
                    status: true,
                    url: "p/" + page.owner + "/" + page.repo,
                    contributors: page.contributors,
                    commits: page.commits,
                    tree: page.tree,
                    styles: page.styles,
                    head: page.head
                });
            } else {
                var treeCommitCollectComplete = false;
                var contributorCommitCollectComplete = false;

                var page = new Page({
                    owner: packet.owner,
                    repo: packet.repo,
                    head: packet.head,
                    styles: config.defaultTheme,
                    tree: {},
                    commits: {},
                    contributors: {},
                    sockets: [{
                        push: true,
                        id: socket.id
                    }]
                });

                function complete() {
                    if (treeCommitCollectComplete && contributorCommitCollectComplete) {
                        page.save(function(err, self) {
                            if (err) console.log("[CodeVisor] " + err);
                        });
                        socket.emit("repo page", {
                            status: true,
                            url: "p/" + packet.owner + "/" + packet.repo,
                            contributors: page.contributors,
                            commits: page.commits,
                            tree: page.tree,
                            styles: page.styles
                        });
                    }
                }
                request({
                    url: "https://api.github.com/repos/" + page.owner + "/" + page.repo + "/commits",
                    headers: {
                        'User-Agent': 'CodeVisor'
                    }
                }, function(error, response, body) {
                    if (!error && (response.statusCode == 200 || response.statusCode == 403)) {
                        var commits = JSON.parse(body);
                        var contributors = [];
                        var commits2 = [];
                        for (var i = 0; i < commits.length; i++) {
                            var duplicate = false;
                            for (var i2 = 0; i2 < contributors.length; i2++) { // check we don't have a duplicate contributor
                                if (contributors[i2].id == commits[i].author.id) {
                                    duplicate = true;
                                    break;
                                }
                            }
                            if (!duplicate) { // we didn't find a duplicate contributor
                                contributors.push({
                                    id: commits[i].author.id,
                                    name: commits[i].commit.author.name,
                                    icon: commits[i].author.avatar_url,
                                    url: commits[i].author.html_url
                                });
                            }
                            delete commits[i].commit.committer;
                            commits[i].commit.author.icon = commits[i].author.avatar_url;
                            commits2.push(commits[i].commit);
                        }
                        page.commits = commits2;
                        page.contributors = contributors;
                        contributorCommitCollectComplete = true;
                        complete();
                    } else {
                        console.log(error);
                        console.log(response.statusCode);
                    }
                });
                request({
                    url: "https://api.github.com/repos/" + page.owner + "/" + page.repo + "/git/trees/" + page.head + "?recursive=1",
                    headers: {
                        'User-Agent': 'CodeVisor'
                    }
                }, function(error, response, body) {
                    if (!error && (response.statusCode == 200 || response.statusCode == 403)) {
                        body = JSON.parse(body);

                        var directory = {
                            name: "/",
                            children: []
                        };

                        function hasChild(name, root) {
                            var indexOfChild = -1;
                            for (var i = 0; i < root.children.length; i++) {
                                if (root.children[i].name === name) {
                                    indexOfChild = i;
                                    break;
                                }
                            }
                            return (indexOfChild);
                        }

                        var root = body.tree;

                        for (var i = 0; i < root.length; i++) { // loop through every file
                            var bookmark = directory;
                            var path = root[i].path.split("/");
                            var name = path[path.length - 1];
                            for (var part = 0; part < path.length; part++) { // loop through every part of the path
                                var newChild = { // this is who we're gonna give birth to
                                    name: name
                                };
                                var extension = name.split(".");
                                extension = extension[extension.length - 1];
                                color = extensions.ext("." + extension);
                                newChild.color = color;
                                if (root[i].type == "tree") { // the file is a directory
                                    newChild.children = []; // our baby currently hasn't got any children
                                    var indexOfChild = hasChild(path[part], bookmark); // does this child already exist?
                                    if (indexOfChild != -1) { // it does
                                        bookmark = bookmark.children[indexOfChild]; // set the bookmark to the correct child
                                    } else { // we need to give birth to it
                                        var newChildIndex = bookmark.children.push({
                                            name: path[part],
                                            children: []
                                        }); // give birth to it!
                                        bookmark = bookmark.children[newChildIndex - 1]; // set the bookmark to be the new child
                                    }
                                } else { // it's a file
                                    for (var part = 0; part < path.length - 1; part++) { // loop through every part of the path (excluding file itself)
                                        bookmark = bookmark.children[hasChild(path[part], bookmark)];
                                    }
                                    newChild.size = root[i].size; // add the size attribute
                                    bookmark.children.push(newChild); // give birth to it!
                                    // note: we don't now set the bookmark because we want the next child to be a younger sibling
                                }
                            }
                        }
                        page.tree = directory;

                        treeCommitCollectComplete = true;
                        complete();
                    } else {
                        console.log(error);
                        console.log(response.statusCode);
                    }
                });
            }
        });

    });

});

var server = http.listen(3003, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('[CodeVisor] Listening at http://%s:%s', host, port);
});