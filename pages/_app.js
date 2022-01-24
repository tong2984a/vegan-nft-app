import '../styles/globals.css'
import '../styles/spinner.css'
import '../styles/product.css'
import "../styles/assets/dist/css/bootstrap.min.css"
import "../styles/fontawesome-free-5.15.4-web/css/fontawesome.min.css"
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState, createContext } from 'react'

export const UserContext = createContext()

function Marketplace({ Component, pageProps }) {

  return (
    <UserContext.Provider value={{}}>
      <div className="container py-3">
        <header>
          <div className="d-flex flex-column flex-md-row align-items-center pb-3 mb-4 border-bottom">
            <a href="/" className="d-flex align-items-center text-dark text-decoration-none">
              <Image
                height="48px"
                width="48px"
                src="/pay-a-vegan.jpeg"
                alt="slider image"
              />
            </a>

            <nav className="d-inline-flex mt-2 mt-md-0 ms-md-auto">
              <Link href="/">
                <a className="me-3 py-2 text-dark text-decoration-none" href="#">Features</a>
              </Link>
              <Link href="/auction">
                <a className="me-3 py-2 text-dark text-decoration-none" href="#">Auction</a>
              </Link>
            </nav>
          </div>
        </header>
        <Component {...pageProps} />
      </div>
    </UserContext.Provider>
  )
}

export default Marketplace
