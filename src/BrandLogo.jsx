export default function BrandLogo({ inverse = false }) {
  return (
    <span
      className={`brand-logo${inverse ? ' inverse' : ''}`}
      aria-label="FayFashionCart"
    >
      FAY<span>FASHION</span>CART
    </span>
  )
}
