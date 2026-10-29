function handler(event) {
  var request = event.request;
  // "/stats" -> "/index.html", "/assets/app.js" stays as is.
  if (request.uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
