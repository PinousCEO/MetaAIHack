namespace Checkout;

/// <summary>Coordinate input validation, shared pricing, cart state and displayed totals.</summary>
public sealed class CheckoutController
{
    readonly CartState cart = new();
    readonly CouponRules pricing = new();
    readonly TotalsView view = new();

    /// <summary>Apply a valid coupon and return the amount that the totals view displays.</summary>
    /// <remarks>Validation and pricing remain independent, reusable implementations.</remarks>
    public double ApplyCoupon(string code)
    {
        if (!CouponValidator.IsValid(code)) return cart.Subtotal;
        cart.SetTotal(pricing.CalculateTotal(cart.Subtotal));
        return view.Read(cart);
    }
}

/// <summary>Present the total held by the cart; does not calculate pricing.</summary>
public sealed class TotalsView
{
    public double Read(CartState cart) { return cart.Total; }
}

/// <summary>A second feature references the same pricing implementation.</summary>
public sealed class CartSummary
{
    public double Estimate(CartState cart) { return new CouponRules().CalculateTotal(cart.Subtotal); }
}
