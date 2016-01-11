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
                    }
                    else {
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
            console.log(body2);
            for (var i = 0; i < body2.length; i++){
                if ()
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