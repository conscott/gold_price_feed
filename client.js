const WebSocket = require('ws')
const url = 'ws://gold-price.cachetoken.io'
const connection = new WebSocket(url)
 
connection.onopen = () => {
  connection.send('Message From Client') 
}
 
connection.onerror = (error) => {
  console.log(`WebSocket error: ${error}`)
}
 
connection.onmessage = (e) => {
  console.log(e.data)
}
