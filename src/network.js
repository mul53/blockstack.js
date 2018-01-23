import bitcoinjs from 'bitcoinjs-lib'

const SATOSHIS_PER_BTC = 1e8

type UTXO = { value: number,
              confirmations: number,
              tx_hash: string,
              tx_output_n: number }

class BlockstackNetwork {
  constructor(apiUrl: string, utxoProviderUrl: string,
              network: ?Object = bitcoinjs.networks.bitcoin) {
    this.blockstackAPIUrl = apiUrl
    this.utxoProviderUrl = utxoProviderUrl
    this.layer1 = network

    this.includeUtxoMap = {}
    this.excludeUtxoSet = []
  }

  coerceAddress(address: string) {
    const addressHash = bitcoinjs.address.fromBase58Check(address).hash
    return bitcoinjs.address.toBase58Check(addressHash, this.layer1.pubKeyHash)
  }

  getNamePrice(fullyQualifiedName: string) {
    return fetch(`${this.blockstackAPIUrl}/v1/prices/names/${fullyQualifiedName}`)
      .then(resp => resp.json())
      .then(x => x.name_price.satoshis)
      .then(satoshis => {
        if (satoshis) {
          return satoshis
        } else {
          throw new Error('Failed to parse price of name')
        }
      })
  }

  getBlockHeight() {
    throw new Error('Not implemented')
  }

  getGracePeriod() {
    return new Promise((resolve) => resolve(5000))
  }

  getNamesOwned(address: string) {
    const networkAddress = this.coerceAddress(address)
    return fetch(`${this.blockstackAPIUrl}/v1/addresses/bitcoin/${networkAddress}`)
      .then(resp => resp.json())
  }

  getNamespaceBurnAddress(namespace: string) {
    return fetch(`${this.blockstackAPIUrl}/v1/namespaces/${namespace}`)
      .then(resp => {
        if (resp.status === 404) {
          throw new Error(`No such namespace '${namespace}'`)
        } else {
          return resp.json()
        }
      })
      .then(namespaceInfo => {
        let address = '1111111111111111111114oLvT2' // default burn address
        const blockHeights = Object.keys(namespaceInfo.history)
        blockHeights.sort((x, y) => (parseInt(x, 10) - parseInt(y, 10)))
        blockHeights.forEach(blockHeight => {
          const infoAtBlock = namespaceInfo.history[blockHeight][0]
          if (infoAtBlock.hasOwnProperty('burn_address')) {
            address = infoAtBlock.burn_address
          }
        })
        return address
      })
      .then(address => this.coerceAddress(address))
  }

  getNameInfo(fullyQualifiedName: string) {
    return fetch(`${this.blockstackAPIUrl}/v1/names/${fullyQualifiedName}`)
      .then(resp => {
        if (resp.status === 404) {
          throw new Error('Name not found')
        } else if (resp.status !== 200) {
          throw new Error(`Bad response status: ${resp.status}`)
        } else {
          return resp.json()
        }
      })
  }

  broadcastTransaction(transaction: string) {
    throw new Error(`Cannot broadcast ${transaction}: not implemented.`)
  }

  getFeeRate() {
    return Math.floor(0.00001000 * SATOSHIS_PER_BTC)
  }

  countDustOutputs() {
    throw new Error('Not implemented.')
  }

  getNetworkedUTXOs(address: string) : Promise<Array<UTXO>> {
    return fetch(`${this.utxoProviderUrl}${address}`)
      .then(resp => resp.json())
  }

  getUTXOs(address: string) : Promise<Array<UTXO>> {
    return this.getNetworkedUTXOs(address)
      .then(returnSet => {
        if (this.includeUtxoMap.hasOwnProperty(address)) {
          returnSet = returnSet.concat(this.includeUtxoMap[address])
        }

        // aaron: I am *well* aware this is O(n)*O(m) runtime
        //    however, clients should clear the exclude set periodically
        const excludeSet = this.excludeUtxoSet
        returnSet = returnSet.filter(
          utxo => {
            const inExcludeSet = excludeSet.reduce(
              (inSet, utxoToCheck) =>
                inSet || (utxoToCheck.tx_hash === utxo.tx_hash &&
                          utxoToCheck.tx_output_n === utxo.tx_output_n), false)
            return !inExcludeSet
          })

        return returnSet
      })
  }

  /**
   * This will modify the network's utxo set to include UTXOs
   *  from the given transaction and exclude UTXOs *spent* in
   *  that transaction
   * @param {String} txHex - the hex-encoded transaction to use
   * @return {void} no return value, this modifies the UTXO config state
   * @private
   */
  modifyUTXOSetFrom(txHex: string) {
    const tx = bitcoinjs.Transaction.fromHex(txHex)

    const excludeSet = this.excludeUtxoSet.concat()

    tx.ins.forEach((utxoUsed) => {
      const reverseHash = Buffer.from(utxoUsed.hash)
      reverseHash.reverse()
      excludeSet.push({ tx_hash: reverseHash.toString('hex'),
                        tx_output_n: utxoUsed.index })
    })

    this.excludeUtxoSet = excludeSet

    const txHash = tx.getHash().reverse().toString('hex')
    tx.outs.forEach((utxoCreated, txOutputN) => {
      if (bitcoinjs.script.classifyOutput(utxoCreated.script) === 'nulldata') {
        return
      }
      const address = bitcoinjs.address.fromOutputScript(
        utxoCreated.script, this.layer1)

      let includeSet = []
      if (this.includeUtxoMap.hasOwnProperty(address)) {
        includeSet = includeSet.concat(this.includeUtxoMap[address])
      }

      includeSet.push({ tx_hash: txHash,
                        confirmations: 0,
                        value: utxoCreated.value,
                        tx_output_n: txOutputN })
      this.includeUtxoMap[address] = includeSet
    })
  }

  resetUTXOs(address: string) {
    delete this.includeUtxoMap[address]
    this.excludeUtxoSet = []
  }

  publishZonefile(zonefile: string) {
    const arg = { zonefile }
    return fetch(`${this.blockstackAPIUrl}/v1/zonefile/`,
                 { method: 'POST',
                   body: JSON.stringify(arg),
                   headers: {
                     'Content-Type': 'application/json'
                   }
                 })
      .then(resp => resp.json())
      .then(respObj => {
        if (respObj.hasOwnProperty('error')) {
          throw new Error(respObj.error)
        }
        return respObj.servers
      })
  }

  getConsensusHash() {
    return fetch(`${this.blockstackAPIUrl}/v1/blockchains/bitcoin/consensus`)
      .then(resp => resp.json())
      .then(x => x.consensus_hash)
  }
}

class LocalRegtest extends BlockstackNetwork {
  constructor(apiUrl: string, bitcoindUrl: string) {
    super(apiUrl, '', bitcoinjs.networks.testnet)
    this.bitcoindUrl = bitcoindUrl
  }

  getFeeRate() {
    return Math.floor(0.00001000 * SATOSHIS_PER_BTC)
  }

  broadcastTransaction(transaction: string) {
    const jsonRPC = { jsonrpc: '1.0',
                      method: 'sendrawtransaction',
                      params: [transaction] }
    return fetch(this.bitcoindUrl, { method: 'POST', body: JSON.stringify(jsonRPC) })
  }

  getNetworkedUTXOs(address: string) : Promise<Array<UTXO>> {
    const jsonRPCImport = { jsonrpc: '1.0',
                            method: 'importaddress',
                            params: [address] }
    const jsonRPCUnspent = { jsonrpc: '1.0',
                             method: 'listunspent',
                             params: [1, 9999999, [address]] }

    return fetch(this.bitcoindUrl, { method: 'POST', body: JSON.stringify(jsonRPCImport) })
      .then(() => fetch(this.bitcoindUrl, { method: 'POST', body: JSON.stringify(jsonRPCUnspent) }))
      .then(resp => resp.json())
      .then(x => x.result)
      .then(utxos => utxos.map(
        x => Object({ value: x.amount * SATOSHIS_PER_BTC,
                      confirmations: x.confirmations,
                      tx_hash: x.txid,
                      tx_output_n: x.vout })))
  }


}

const LOCAL_REGTEST = new LocalRegtest(
  'http://localhost:16268', 'http://blockstack:blockstacksystem@127.0.0.1:18332/')

const MAINNET_DEFAULT = new BlockstackNetwork(
  'https://core.blockstack.org', 'https://blockchain.info/unspent?format=json&active=')


export const network = { BlockstackNetwork, LocalRegtest,
                         defaults: { LOCAL_REGTEST, MAINNET_DEFAULT } }
