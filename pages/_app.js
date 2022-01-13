import '../styles/globals.css'
import '../styles/spinner.css'
import '../styles/product.css'
import "../styles/assets/dist/css/bootstrap.min.css"
import "../styles/fontawesome-free-5.15.4-web/css/fontawesome.min.css"
import Link from 'next/link'

function Marketplace({ Component, pageProps }) {
  return (
    <div>
      <Component {...pageProps} />
    </div>
  )
}

export default Marketplace
