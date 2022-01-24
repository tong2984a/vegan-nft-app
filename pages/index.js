import { ethers } from 'ethers'
import { create as ipfsHttpClient } from 'ipfs-http-client'
import { useEffect, useState, useContext } from 'react'
import axios from 'axios'
import Image from 'next/image'
import { initializeApp, getApps } from "firebase/app"
import { getStorage, ref, listAll } from "firebase/storage";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc } from "firebase/firestore";
import config from '../config.json'
import NFT from '../artifacts/contracts/NFT.sol/NFT.json'
import Market from '../artifacts/contracts/Market.sol/NFTMarket.json'
import { UserContext } from './_app'

const tokenSymbol = config['token']['symbol']
const tokenWatchAssetUrl = config['token']['wallet_watchAsset']['url']
const nftaddress = config['deployed']['nftaddress']
const nftmarketaddress = config['deployed']['nftmarketaddress']
const envChainName = config['deployed']['envChain']['name']
const envChainId = config['deployed']['envChain']['id']
const client = ipfsHttpClient('https://ipfs.infura.io:5001/api/v0')

export default function Membership() {
  const [info, updateInfo] = useState({})
  const [nfts, setNfts] = useState([])

  function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
      // MetaMask is locked or the user has not connected any accounts
      updateInfo({message: 'Please connect to MetaMask.'})
    }
  }

  async function register(nft) {
    if (nft.tokenId === '-') {
      return updateInfo({message: "Unable to connect to network. Please check MetaMask and try again."})
    }
    if (window.ethereum) {
      try {
        // wasAdded is a boolean. Like any RPC method, an error may be thrown.
        let wasAdded = await window.ethereum.request({
          method: 'wallet_watchAsset',
          params: {
            type: 'ERC20', // Initially only supports ERC20, but eventually more!
            options: {
              address: nft.nftContract,
              symbol: nft.symbol,
              decimals: 0,
              image: tokenWatchAssetUrl,
              abi: NFT.abi
            }
          }
        })
        if (wasAdded) {
          updateInfo({message: 'Thanks for your interest!'})
        }
      } catch(err) {
        if (err.code === 4001) {
          // EIP-1193 userRejectedRequest error
          // If this happens, the user rejected the connection request.
          updateInfo({message: 'Please connect to MetaMask.'})
        } else {
          updateInfo({message: (err.message || err)})
        }
      }
    } else {
      updateInfo({message: "Unable to process without a crypto wallet. Please refresh screen to try again."})
    }
  }

  async function mint(nft) {
    if (nft.tokenId === '-') {
      return updateInfo({message: "Unable to connect to network. Please check MetaMask and try again."})
    }
    if (window.ethereum) {
      updateInfo({showModal: true, message: 'Please wait. Smart contract is processing.'})
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum)
        const signer = provider.getSigner()

        let market = new ethers.Contract(nftmarketaddress, Market.abi, signer)
        let price = ethers.utils.parseUnits(nft.price.toString(), 'ether')
        let transaction = await market.createMarketSale(nft.nftContract, nft.itemId, {value: price})
        let tx = await transaction.wait()
      } catch (error) {
        if (error.data) {
          updateInfo({showModal: false, message: `Crypto Wallet Error: ${error.data.message}`})
        } else {
          updateInfo({showModal: false, message: `Crypto Wallet Error: ${error.message || error}`})
        }
      }
    } else {
      updateInfo({message: "Non-Ethereum browser detected. You should consider installing MetaMask."})
    }
  }

  async function loadNfts(nft, market, envChainId) {
    let items = []
    updateInfo({showModal: true, message: "Please wait. Smart contract is processing."})
    try {
      await _ethAccountsRequest()
      let marketItems = await market.fetchMarketItems()
      items = await Promise.all(marketItems.map(async i => {
        const tokenUri = await nft.tokenURI(i.tokenId)
        let price = ethers.utils.formatUnits(i.price.toString(), 'ether')
        let item = {
          tokenId: i.tokenId.toNumber(),
          itemId: i.itemId.toNumber(),
          symbol: 'VEG',
          image: '/pay-a-vegan.mp4',
          nftContract: i.nftContract,
          decimals: 0,
          price,
          tokenUri
        }
        return item
      }))
      if (items.length === 0) {
        //dummy item for display when no nft is found
        items = [{
          tokenId: '-',
          itemId: 0,
          symbol: 'VEG',
          image: '/pay-a-vegan.mp4',
          nftContract: 0,
          decimals: 0,
          price: 0,
          tokenUri: ''
        }]
      }
    } catch(ex) {
      updateInfo({message: ex.message})
      //dummy item for display when no nft is found
      items = [{
        tokenId: '-',
        itemId: 0,
        symbol: 'VEG',
        image: '/pay-a-vegan.mp4',
        nftContract: 0,
        decimals: 0,
        price: 0,
        tokenUri: ''
      }]
    } finally {
      setNfts(items)
      updateInfo({showModal: false, message: ""})
    }
  }

  useEffect(() => {
    if (window.ethereum) {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()
      let nft = new ethers.Contract(nftaddress, NFT.abi, signer)
      let market = new ethers.Contract(nftmarketaddress, Market.abi, signer)

      window.ethereum.on('chainChanged', (chainId) => {
        // Handle the new chain.
        // Correctly handling chain changes can be complicated.
        // We recommend reloading the page unless you have good reason not to.
        window.location.reload();
      })

      window.ethereum.on('accountsChanged', handleAccountsChanged);

      market.on("MarketItemCreated", (itemId, nftContract, tokenId, seller, owner, price) => {
        loadNfts(nft, market, envChainId)
      })

      market.on("MarketItemSold", (itemId, nftContract, tokenId, owner, seller, price) => {
        loadNfts(nft, market, envChainId)
      })

      loadNfts(nft, market, envChainId)
    } else {
      //dummy item for display with non-ethereum browser
      let item = {
        tokenId: 'n/a',
        itemId: 0,
        symbol: 'VEG',
        image: '/pay-a-vegan.mp4',
        nftContract: 0,
        decimals: 0,
        price: 0,
        tokenUri: ''
      }
      setNfts([item])
      updateInfo({message: "Non-Ethereum browser detected. You should consider installing MetaMask."})
    }
    return function cleanup() {
      //mounted = false
    }
  }, [])

  async function _ethRegister() {
    if (window.ethereum) {
      try {
        // wasAdded is a boolean. Like any RPC method, an error may be thrown.
        let wasAdded = await window.ethereum.request({
          method: 'wallet_watchAsset',
          params: {
            type: 'ERC20', // Initially only supports ERC20, but eventually more!
            options: {
              address: nftaddress,
              symbol: tokenSymbol,
              decimals: 0,
              image: tokenWatchAssetUrl,
              abi: NFT.abi
            }
          }
        })
        if (wasAdded) {
          updateInfo({message: "Thanks for your interest!"})
        }
      } catch(err) {
        if (err.code === 4001) {
          // EIP-1193 userRejectedRequest error
          // If this happens, the user rejected the connection request.
          updateInfo({message: "Please connect to MetaMask."})
        } else {
          updateInfo({message: err.message || err})
        }
      }
    } else {
      updateInfo({message: "Unable to process without a crypto wallet. Please refresh screen to try again."})
    }
  }

  async function _ethAccountsRequest() {
    if (window.ethereum) {
      let result = await Promise.all([
        window.ethereum.request({ method: 'eth_requestAccounts' }),
        window.ethereum.request({ method: 'eth_chainId' })
      ]).catch((error) => {
        if (error.code === 4001) {
          throw {title: 'Error - Please check your wallet and try again', message: 'Connection request has been rejected. '}
        } else if (error.code === -32002) {
          throw {title: 'Error - Please check your wallet and try again', message: error.message}
        } else {
          throw {title: 'Error - Please check your wallet and try again', message: error.message}
        }
      })
      if (result) {
        let [accounts, chainId] = result
        if (accounts.length === 0) {
          throw {title: 'Error - Please check your wallet and try again', message: `MetaMask is locked or the user has not connected any accounts`}
        }
        if (chainId !== envChainId) {
          throw {title: 'Error - Please check your wallet and try again', message: `Error - Is your wallet connected to ${envChainName}?`}
        }
        updateInfo({message: "Metamask wallet adapter is connected and ready to use."})
      }
      return result
    } else {
      throw {title: 'Error - Non-Ethereum browser detected.', message: 'You should consider installing MetaMask'}
    }
  }

  async function _ethWalletRequestPermissions() {
    if (window.ethereum) {
      try {
        let permissions = await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [
            {
              eth_accounts: {}
            }
          ]
        })
        const accountsPermission = permissions.find(
          (permission) => permission.parentCapability === 'eth_accounts'
        )
        if (accountsPermission) {
          updateInfo({message: 'eth_accounts permission successfully requested!'})
        }
      } catch(error) {
        if (error.code === 4001) {
          throw {title: 'Error - Please check your wallet and try again', message: 'Connection request has been rejected. '}
        } else if (error.code === -32601) {
          throw {title: 'Error - Please check your wallet and try again', message: 'Permissions needed to continue.'}
        } else if (error.code === -32002) {
          throw {title: 'Error - Please check your wallet and try again', message: error.message}
        } else {
          throw {title: 'Error - Please check your wallet and try again', message: error.message}
        }
      }
    } else {
      throw {title: 'Error - Non-Ethereum browser detected.', message: 'You should consider installing MetaMask'}
    }
  }

  if (info.showModal) return (
    <div className="modal modal-sheet position-static d-block bg-secondary py-5" tabIndex="-1" role="dialog" id="modalSheet">
      <div className="modal-dialog" role="document">
        <div className="modal-content rounded-6 shadow">
          <div className="modal-header border-bottom-0">
            <h5 className="modal-title">{info.title}</h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" onClick={() => updateInfo({showModal: false})}></button>
          </div>
          <div className="modal-body py-0">
            <p>{info.message}</p>

            {info.loading && <div className="loader"></div>}
          </div>
          <div className="modal-footer flex-column border-top-0">
            {info.btn &&
              <button type="button" className="btn btn-lg btn-primary w-100 mx-0 mb-2">{info.btn}</button>}
            <button type="button" className="btn btn-lg btn-light w-100 mx-0" onClick={() => updateInfo({showModal: false})}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
  return (
    <div>
      <main>
        <section className="py-5 text-center container">
          <div className="row">
            <div className="col-lg-6 col-md-8 mx-auto">
              <h1 className="fw-light">WELCOME TO</h1>
              <h1 className="fw-light">PAY-A-VEGAN NFT CLUB</h1>
              <p>{info.message}</p>
            </div>
          </div>
        </section>
        <div className="album py-2 bg-light">
          <div className="text-left container">
            <div className="col-lg-10 col-md-10 mx-auto">
              <p className="fw-light">By owning a Pay-a-Vegan NFT Pass,  you become @GlobalEarthling committed to living a Vegan LifeStyle at your Best !</p>
              <p className="fw-light">Membership grants you access to future Projects,  Rewards, private community chat and announcements,  early access to partner NFT projects and much more.</p>
            </div>
          </div>
          <div className="py-2 container">
            <div className="row justify-content-center row-cols-1 row-cols-sm-2 row-cols-md-3 g-3">
            {nfts.map((nft, i) => (
              <div key={i} className="col">
                <div className="card shadow-sm">
                  <video key={i} autoPlay muted loop alt="NFT series" width="100%" height="100%"
                     src={nft.image} poster={nft.image} />
                  <div className="card-body">
                    <p className="card-text">{nft.price} ETH</p>
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="btn-group">
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => register(nft)}>Register</button>
                        <button type="button" className="btn btn-sm btn-warning" onClick={() => mint(nft)}>Mint</button>
                      </div>
                      <small className="text-muted">No. {nft.tokenId}</small>
                    </div>
                  </div>
                </div>
              </div>
            ))
            }
            </div>
          </div>
        </div>
      </main>

      <footer className="text-muted py-5">
        <div className="container">
          <p className="float-end mb-1">
            <a href="#">Back to top</a>
          </p>
          <p className="mb-1">Copyright ©2022</p>
        </div>
      </footer>
    </div>
  )
}
