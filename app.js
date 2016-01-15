/*
    (c) 2015 Finnian Anderson. All rights reserved.
*/

var config = require("./config.js");
var io, socket_end_point;

var express = require("express");
var app = express();
var http = require("http").Server(app);
var sha1 = require("sha1");
var request = require("request");

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

app.use("/", express.static(__dirname + "/static"));

app.get("/get_config", function(req, res) {
    res.json(config);
});

app.get("/p/*", function(req, res) {
    console.log("Repo page requested for " + req.params[0]);
    res.redirect("/");
});

io.on("connection", function(socket) {
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
        console.log(packet);
        request({
            url: "https://api.github.com/repos/" + packet.owner + "/" + packet.repo + "/commits",
            headers: {
                'User-Agent': 'CodeVisor'
            }
        }, function(error, response, body) {
            request({
                url: "https://api.github.com/repos/" + packet.owner + "/" + packet.repo + "/git/trees/master?recursive=1",
                headers: {
                    'User-Agent': 'CodeVisor'
                }
            }, function(error2, response2, body2) {
                body2 = JSON.parse(body2);


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

                var root = body2.tree;

                for (var i = 0; i < root.length; i++) { // loop through every file
                    var bookmark = directory;
                    var path = root[i].path.split("/");
                    console.log(path);
                    var name = path[path.length - 1];
                    for (var part = 0; part < path.length; part++) { // loop through every part of the path
                        console.log("--- Checking " + path[part]);
                        var newChild = { // this is who we're gonna give birth to
                            name: name
                        };
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
                            console.log("\tAdding " + name + " to " + bookmark.name);
                            newChild.size = root[i].size; // add the size attribute
                            bookmark.children.push(newChild); // give birth to it!
                            // note: we don't know set the bookmark because we want the next child to be a younger sibling
                        }
                    }
                }

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
                    socket.emit("repo page", {
                        status: true,
                        url: "p/" + packet.owner + "/" + packet.repo,
                        contributors: contributors,
                        commits: commits2
                    });
                } else {
                    console.log(error);
                    console.log(response.statusCode);
                }
            });
        });
    });

});

var server = http.listen(3003, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('CodeVisor listening at http://%s:%s', host, port);
});