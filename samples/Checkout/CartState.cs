namespace Checkout;

/// <summary>One cart state shared by checkout and the cart summary.</summary>
public sealed class CartState
{
    public double Subtotal = 120;
    public double MugPrice = 48;
    public double PlantPrice = 72;
    public double Total;

    public void SetTotal(double total) { Total = total; }
}
