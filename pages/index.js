import { ethers } from 'ethers'
import { create as ipfsHttpClient } from 'ipfs-http-client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import Web3Modal from "web3modal"
import Image from 'next/image'
import { useRouter } from 'next/router'
import { initializeApp, getApps } from "firebase/app"
import { getStorage, ref, listAll } from "firebase/storage";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc } from "firebase/firestore";

const client = ipfsHttpClient('https://ipfs.infura.io:5001/api/v0')
import {
  nftaddress, nftmarketaddress
} from '../config'

import NFT from '../artifacts/contracts/NFT.sol/NFT.json'
import Market from '../artifacts/contracts/Market.sol/NFTMarket.json'

export default function Membership() {
  const [errorMessage, setErrorMessage] = useState('')
  const [modalPendingMessage, setModalPendingMessage] = useState('')
  const [address, setAddress] = useState('')
  const [nfts, setNfts] = useState([])
  const router = useRouter()

  function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
      // MetaMask is locked or the user has not connected any accounts
      console.log('Please connect to MetaMask.');
    } else if (accounts[0] !== address) {
      setAddress(accounts[0]);
    }
  }

  async function register(nft) {
    if (nft.tokenId === '-') {
      return setErrorMessage("Unable to connect to network. Please check MetaMask and try again.")
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
              image: "https://ipfs.infura.io/ipfs/QmdkuYAXeHW5biytdw5Ff626AkdsmocRW4vaGYTMNK6qWv",
              abi: NFT.abi
            }
          }
        })
        if (wasAdded) {
          console.log('Thanks for your interest!')
        } else {
          console.log('Your loss!')
        }
      } catch(err) {
        if (err.code === 4001) {
          // EIP-1193 userRejectedRequest error
          // If this happens, the user rejected the connection request.
          console.log('Please connect to MetaMask.');
        } else {
          console.error(err.message || err);
        }
      }
    } else {
      setErrorMessage("Unable to process without a crypto wallet. Please refresh screen to try again.")
    }
  }

  async function mint(nft) {
    if (nft.tokenId === '-') {
      return setErrorMessage("Unable to connect to network. Please check MetaMask and try again.")
    }
    if (window.ethereum) {
      setModalPendingMessage("Please wait. Smart contract is processing.")
      try {
        const web3Modal = new Web3Modal()
        let connection = await web3Modal.connect()
        const provider = new ethers.providers.Web3Provider(connection)
        const signer = provider.getSigner()

        let market = new ethers.Contract(nftmarketaddress, Market.abi, signer)
        let biddingPrice = ethers.utils.parseUnits(nft.bidPrice.toString(), 'ether')
        let transaction = await market.createMarketSale(nftaddress, nft.itemId, {value: biddingPrice})
        let tx = await transaction.wait()
        window.location.reload()
      } catch (error) {
        if (error.data) {
          setErrorMessage(`Crypto Wallet Error: ${error.data.message}`)
        } else {
          setErrorMessage(`Crypto Wallet Error: ${error.message || error}`)
        }
      } finally {
        setModalPendingMessage("")
      }
    } else {
      setErrorMessage("Non-Ethereum browser detected. You should consider installing MetaMask.")
    }
  }

  async function loadNfts() {
    let items = []
    try {
      const web3Modal = new Web3Modal()
      const connection = await web3Modal.connect()
      const provider = new ethers.providers.Web3Provider(connection)
      const signer = provider.getSigner()

      let nft = new ethers.Contract(nftaddress, NFT.abi, signer)
      let market = new ethers.Contract(nftmarketaddress, Market.abi, signer)
      let marketItems = await market.fetchMarketItems()

      items = await Promise.all(marketItems.map(async i => {
        const tokenUri = await nft.tokenURI(i.tokenId)
        let bidPrice = ethers.utils.formatUnits(i.price.toString(), 'ether')
        let item = {
          tokenId: i.tokenId.toNumber(),
          itemId: i.itemId.toNumber(),
          symbol: 'VEG',
          image: '/pay-a-vegan.mp4',
          nftContract: i.nftContract,
          decimals: 0,
          bidPrice,
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
          bidPrice: 0,
          tokenUri: ''
        }]
      }
    } catch(ex) {
      console.error(ex)
      //dummy item for display when no nft is found
      items = [{
        tokenId: '-',
        itemId: 0,
        symbol: 'VEG',
        image: '/pay-a-vegan.mp4',
        nftContract: 0,
        decimals: 0,
        bidPrice: 0,
        tokenUri: ''
      }]
    } finally {
      setNfts(items)
    }
  }

  useEffect(() => {
    if (window.ethereum) {
      loadNfts()
    } else {
      //dummy item for display with non-ethereum browser
      let item = {
        tokenId: 'n/a',
        itemId: 0,
        symbol: 'VEG',
        image: '/pay-a-vegan.mp4',
        nftContract: 0,
        decimals: 0,
        bidPrice: 0,
        tokenUri: ''
      }
      setNfts([item])
    }
    return function cleanup() {
      //mounted = false
    }
  }, [])

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum
        .request({ method: 'eth_requestAccounts' })
        .then(handleAccountsChanged)
        .catch((err) => {
          if (err.code === 4001) {
            // EIP-1193 userRejectedRequest error
            // If this happens, the user rejected the connection request.
            console.log('Please connect to MetaMask.');
          } else {
            console.error(err);
          }
        });
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', (chainId) => {
        window.location.reload()
      })
    } else {
      setAddress("Non-Ethereum browser detected. You should consider installing MetaMask.")
    }
    return function cleanup() {
      //mounted = false
    }
  }, [])

  if (modalPendingMessage) return (
    <div className="p-4">
      <p>{modalPendingMessage}</p>
      <div className="loader"></div>
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
              <p>{errorMessage}</p>
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
                    <p className="card-text">{nft.bidPrice} ETH</p>
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
