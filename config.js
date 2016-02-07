module.exports = {
    production: false,
    google_analytics: false,
    defaultTheme: {
        "[dot]repo-page": { // make sure to escape all '.'s in class selectors with '[dot]' or Mongo will complain
            background: "black"
        },
        "#video-pane, #sidebar, #contributors": {
            background: "red"
        }
    }
}