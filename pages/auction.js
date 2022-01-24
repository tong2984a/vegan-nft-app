import { ethers } from 'ethers'
import { create as ipfsHttpClient } from 'ipfs-http-client'
import { useEffect, useState, useContext } from 'react'
import axios from 'axios'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { initializeApp, getApps } from "firebase/app"
import { getStorage, ref, listAll } from "firebase/storage";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc } from "firebase/firestore";
import config from '../config.json'
import NFT from '../artifacts/contracts/NFT.sol/NFT.json'
import Market from '../artifacts/contracts/Market.sol/NFTMarket.json'
import Auction from '../artifacts/contracts/Auction.sol/Auction.json'
import { UserContext } from './_app'

const tokenSymbol = config['token']['symbol']
const tokenWatchAssetUrl = config['token']['wallet_watchAsset']['url']
const nftaddress = config['deployed']['nftaddress']
const nftmarketaddress = config['deployed']['nftmarketaddress']
const auctionAddress = config['deployed']['auctionAddress']
const envChainName = config['deployed']['envChain']['name']
const envChainId = config['deployed']['envChain']['id']
const client = ipfsHttpClient('https://ipfs.infura.io:5001/api/v0')

export default function NFTAuction() {
  const [info, updateInfo] = useState({})
  const [nft, setNft] = useState({
    tokenId: '-',
    itemId: 0,
    symbol: 'VEG',
    image: '/pay-a-vegan.mp4',
    nftContract: 0,
    decimals: 0,
    price: 0,
    tokenUri: ''
  })
  const [formInput, updateFormInput] = useState({ price: '' })
  const [bids, setBids] = useState([])
  const [refund, setRefund] = useState(0)

  useEffect(() => {
    if (window.ethereum) {
      //let nft = new ethers.Contract(nftaddress, NFT.abi, signer)
      //let market = new ethers.Contract(nftmarketaddress, Market.abi, signer)

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()
      let auctionContract = new ethers.Contract(auctionAddress, Auction.abi, signer)
      const bidFilter = auctionContract.filters.HighestBidIncreased(null, null)
      auctionContract.on(bidFilter, async (sender, value, event) => {
        let [accounts, chainId] = await handleAccountsRequest()
        const provider = new ethers.providers.Web3Provider(window.ethereum)
        const signer = provider.getSigner()
        let auctionContract = new ethers.Contract(auctionAddress, Auction.abi, signer)
        const BLOCKS_PER_DAY = 6_500
        const bidFilter = auctionContract.filters.HighestBidIncreased(null, null)
        const previousBids = await auctionContract.queryFilter(bidFilter, 0 - BLOCKS_PER_DAY);
        let arr = previousBids.map((event, i) => {
          let bidder = event.args[0]
          let bidderShort = [bidder.substr(0, 4), bidder.substr(38, 4)].join('...')
          let price = ethers.utils.formatUnits(event.args[1].toString(), 'ether')
          return {bidder, bidderShort, price}
        })
        let sorted_arr = arr.sort(function(a, b) {
          return b.price - a.price
        })
        setBids(sorted_arr)
        let payment = await auctionContract.payments(accounts[0])
        if (payment > 0) {
          setRefund(payment)
          updateInfo({showModal: true, loading: true, btn:'Withdraw Now', title: "Funds Available", message: "You may withdraw previous bids that were overbid once the auction is over."})
        } else {
          updateInfo({showModal: false, message: ''})
        }
      })
      handleAccountsRequest()
    } else {
      updateInfo({message: "Non-Ethereum browser detected. You should consider installing MetaMask."})
    }
    return function cleanup() {
      //mounted = false
    }
  }, [])

  async function handleAccountsRequest() {
    try {
    console.log("handleAccountsRequest")
      return await _ethAccountsRequest()
    } catch(error) {
      updateInfo({message: error.message})
    }
  }

  async function _ethAccountsRequest() {
    if (window.ethereum) {
      console.log("_ethAccountsRequest")
      let result = await Promise.all([
        window.ethereum.request({ method: 'eth_requestAccounts' }),
        window.ethereum.request({ method: 'eth_chainId' })
      ]).catch((error) => {
        console.log("error1")
        console.error(error)
        if (error.code === 4001) {
          throw {title: 'Error - Please check your wallet and try again', message: 'Connection request has been rejected. '}
        } else if (error.code === -32002) {
          throw {title: 'Error - Please check your wallet and try again', message: error.message}
        } else {
          throw {title: 'Error - Please check your wallet and try again', message: error.message}
        }
      })
        console.log("after Promise")
      if (result) {
        console.log("result")
        console.log(result)
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

  async function handlePlaceBid() {
    updateInfo({message: ''})
    if (window.ethereum) {
      updateInfo({showModal: true, loading: true, message: "Please wait. Smart contract is processing."})
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum)
        const signer = provider.getSigner()
        let auctionContract = new ethers.Contract(auctionAddress, Auction.abi, signer)
        let price = ethers.utils.parseUnits(formInput['price'].toString(), 'ether')
        let transaction = await auctionContract.bid({value: price})
        await transaction.wait()
      } catch (error) {
        if (error.data) {
          const reason = error.data.message.split('custom error')[1]
          updateInfo({showModal: false, message: `Crypto Wallet Error: ${reason.split(/(?=[A-Z])/).join(' ')}`})
        } else {
          updateInfo({showModal: false, message: `Crypto Wallet Error: ${error.message || error}`})
        }
      }
    } else {
      updateInfo({message: "Non-Ethereum browser detected. You should consider installing MetaMask."})
    }
  }

  async function handleWithdraw() {
    updateInfo({message: ''})
    if (window.ethereum) {
      updateInfo({showModal: true, loading: true, message: "Please wait. Smart contract is processing."})
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum)
        const signer = provider.getSigner()
        let auctionContract = new ethers.Contract(auctionAddress, Auction.abi, signer)
        let [accounts, chainId] = await handleAccountsRequest()
        await auctionContract.withdrawPayments(accounts[0])
        updateInfo({message: 'Withdrawal completed successfully.'})
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

  async function register(nft) {
    updateInfo({message: ''})
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
              <button type="button" className="btn btn-lg btn-primary w-100 mx-0 mb-2" onClick={handleWithdraw}>{info.btn}</button>}
            <button type="button" className="btn btn-lg btn-light w-100 mx-0" onClick={() => updateInfo({showModal: false})}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
  return (
    <div className="container">
      <main>
        <section className="py-5 text-center container">
          <div className="row">
            <div className="col-lg-6 col-md-8 mx-auto">
              <p>{info.message}</p>
            </div>
          </div>
        </section>
        <div className="row g-5">
          <div className="col-md-5 col-lg-4 order-md-last">
            <h4 className="d-flex justify-content-between align-items-center mb-3">
              <span className="text-primary">Highest Bids</span>
              <span className="badge bg-primary rounded-pill">{bids.length}</span>
            </h4>
            <div className="card p-2 mb-3">
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="MATIC"
                  value={formInput.price}
                  onChange={e => updateFormInput({ ...formInput, price: e.target.value })}
                />
                <button className="btn btn-secondary" onClick={handlePlaceBid}>Place Bid</button>
              </div>
            </div>
            <ul className="list-group mb-3">
            {bids.map((bid, i) => (
              <li key={i} className="list-group-item d-flex justify-content-between lh-sm">
                <div>
                  <h6 className="my-0">{bid.bidderShort}</h6>
                  <small className="text-muted">Brief description</small>
                </div>
                <span className="text-muted">{bid.price}</span>
              </li>
            ))}
              <li className="list-group-item d-flex justify-content-between">
                <span>Highest Bid (MATIC)</span>
                <strong>{bids[0]?.price}</strong>
              </li>
            </ul>
          </div>
          <div className="col-md-7 col-lg-8">
            <div className="card shadow-sm">
              <video autoPlay muted loop alt="NFT series" width="100%" height="100%"
                 src={nft.image} poster={nft.image} />
              <div className="card-body">
                <p className="card-text">{bids[0]?.price} ETH</p>
                <div className="d-flex justify-content-between align-items-center">
                  <div className="btn-group">
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => register(nft)}>Register</button>
                  </div>
                  <small className="text-muted">No. {nft.tokenId}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="my-5 pt-5 text-muted text-center text-small">
        <p className="mb-1">&copy; 2017–2021 Pay A Vegan</p>
        <ul className="list-inline">
          <li className="list-inline-item"><a href="#">Privacy</a></li>
          <li className="list-inline-item"><a href="#">Terms</a></li>
          <li className="list-inline-item"><a href="#">Support</a></li>
        </ul>
      </footer>
    </div>
  )
}
