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
                    socket.emit("head list", {
                        heads: JSON.parse(body),
                        owner: owner,
                        repo: repo
                    });
                });
            }
        }
    });

    socket.on("repo page", function(packet) {
        console.log("https://api.github.com/repos/" + packet.owner + "/" + packet.repo + "/commits");
        request({
            url: "https://api.github.com/repos/" + packet.owner + "/" + packet.repo + "/commits",
            headers: {
                'User-Agent': 'CodeVisor'
            }
        }, function(error, response, body) {
            var log = [];
            if (!error && (response.statusCode == 200 || response.statusCode == 403)) {
                var commits = JSON.parse(body);
                for (var i = 0; i < commits.length; i++) {
                    log.push({
                        date: commits[i].commit.author.date,
                        user: commits[i].commit.author.name,
                        sha: commits[i].sha,
                        
                    });
                }
                socket.emit("repo page", {
                    status: true,
                    url: "p/" + packet.owner + "/" + packet.repo
                });
            } else {
                console.log(error);
                console.log(response.statusCode);
            }
        });
    });

});

var server = http.listen(3003, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('CodeVisor listening at http://%s:%s', host, port);
});