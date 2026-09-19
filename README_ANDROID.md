# TryOnAI Ultra Pro — Android + Real AI Try-On

Package: com.tryonai.ultrapro
Version: 2.0.0

## Real AI Try-On
The Android UI now sends:
- person_image
- garment_image

to `/api/tryon`. The server proxy calls the TryOnCloud Developer API and streams the generated PNG back to the app.

## Required production setup
1. Create a TryOnCloud account and Developer API key.
2. Deploy this repository to Vercel.
3. Add Vercel environment variable:
   `TRYONCLOUD_API_KEY=<your key>`
4. The Android app must be rebuilt with the deployed API base URL if the API is hosted on a separate domain.

Never put the TryOnCloud key inside the Android app.

## Current product status
- Real AI Try-On: backend integration ready; provider key/deployment required.
- Voice command: UI ready.
- AI Stylist: UI/demo looks.
- Shopping: marketplace search links.
- Fashion Video: UI/demo flow; video provider still needs integration.
- Plans: UI; Google Play Billing still needs integration.

The provider currently offers 10 free Developer API try-ons, then pay-as-you-go. See provider docs for current terms and pricing.
