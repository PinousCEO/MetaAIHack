namespace Checkout;

/// <summary>Shared coupon pricing, independent of the user interface.</summary>
/// <remarks>Both checkout and cart summary call this implementation, so their pricing rules cannot drift.</remarks>
public sealed class CouponRules
{
    public const double DiscountPercent = 20;

    /// <summary>Calculate the discounted subtotal using the shared percentage.</summary>
    public double CalculateTotal(double subtotal)
    {
        return subtotal * (1 - DiscountPercent / 100);
    }
}

/// <summary>Validate coupon eligibility before calculating a discounted total.</summary>
public static class CouponValidator
{
    public static bool IsValid(string code) { return code == "WELCOME20"; }
}
