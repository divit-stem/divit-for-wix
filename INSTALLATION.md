# Installation Guide: Divit FPS Payment Gateway for Wix

This guide walks you through the step-by-step process of integrating **FPS by Divit** as a custom payment service provider on your Wix website using **Wix Velo and Payment SPI (Service Provider Interface)**.

---

## 📋 Prerequisites

Before starting the installation, ensure you have:
1. A **Wix Premium Plan** (Wix requires a premium site to publish and connect custom payment SPI integrations).
2. A **Custom Domain** connected to your Wix site.
3. Your **Divit API Credentials** (API Key and Webhook Signature Key) for both Production and Sandbox environments, retrieved from your [Divit Merchant Admin Portal](https://divit.com.hk).

---

## 🛠️ Step-by-Step Installation

### Step 1: Enable Developer Mode
1. Log in to your **Wix Dashboard** and open your website's **Site Editor** (Classic Editor or Wix Studio).
2. In the top menu bar, click **Dev Mode** (or **Developer Tools**) and select **Turn on Developer Mode** (or **Enable Velo**).

---

### Step 2: Create the Payment SPI Plugin
Wix uses SPIs (Service Provider Interfaces) to safely communicate with custom payment gateways.
1. In the left-hand sidebar of the editor, click the **Code** icon (`{}`) to open the Velo Sidebar.
2. Under the **Public & Backend** section, locate **Service Plugins**.
3. Click the **+** (Add) icon next to *Service Plugins* and choose **Payment**.
4. In the prompt, enter exactly `divit` as the service name and click **Add & Edit Code**.
5. Wix will automatically generate the following directory structure in your editor:
   ```text
   📁 service-plugins
    └── 📁 payment-provider
        └── 📁 divit
             ├── 📄 divit-config.js
             └── 📄 divit.js
   ```

---

### Step 3: Copy SPI Integration Code
Replace the contents of the generated files with the integration code from this repository:

1. **Copy `divit-config.js`:**
   * Open the local file `src/service-plugins/payment-provider/divit/divit-config.js`.
   * Copy the code and paste it to completely overwrite the default contents of the generated `divit-config.js` in your Wix Site Editor.
2. **Copy `divit.js`:**
   * Open the local file `src/service-plugins/payment-provider/divit/divit.js`.
   * Copy the code and paste it to completely overwrite the default contents of the generated `divit.js` in your Wix Site Editor.

---

### Step 4: Create Webhook Handler (HTTP Functions)
Since Divit updates payments and refunds asynchronously, we must expose a public webhook endpoint so Divit can notify Wix of transaction outcomes.

1. Under the **Public & Backend** section in the left sidebar, click the **+** (Add) icon next to **Backend** files.
2. Choose **New File** and name it exactly `http-functions.js`.
   > [!NOTE]
   > If you already have a `http-functions.js` file in your site, do **not** overwrite it. Instead, copy the function `post_updateDivitTransaction` and any helper functions/constants from our `src/http-functions.js` file and append them to your existing file.
3. Open `src/http-functions.js` from this repository, copy the full contents, and paste them into your site's `http-functions.js` file.

---

### Step 5: Configure Site Constants
To allow the plugin to compute webhook routes correctly, we must supply your live site domain.

1. Under the **Backend** files in the Velo sidebar, create a new file named `divit-constants.js`.
2. Open `src/divit-constants.js` from this repository and copy the code:
   ```javascript
   export const WEBSITE_URL = "https://yourdomain.com/";
   ```
3. Change `"https://yourdomain.com/"` to your actual live Wix site URL (ensure it includes the trailing slash).

---

### Step 6: Publish Your Website
Custom HTTP Functions and SPI hooks do **not** run in the local Wix Preview window. They are only compiled and activated when the site is published.

* Click the blue **Publish** button in the top-right corner of the Wix Editor.

---

### Step 7: Activate the Plugin in the Wix Dashboard
Once the site is published, Wix will detect the SPI configuration and display the new payment option in your site's back-office.

1. Navigate back to your main **Wix Dashboard**.
2. Go to **Settings > Accept Payments**.
3. Under the payment provider lists, you will now see **FPS by divit** listed with our custom branding.
4. Click **Connect** (or **Manage**) next to *FPS by divit*.
5. In the settings panel, fill in the credentials:
   * **API Key** & **Signature Key**: Your production credentials from Divit.
   * **Sandbox Mode**: Check this box if you want to perform tests without real money.
   * **API Key (Sandbox)** & **Signature Key (Sandbox)**: Your test credentials from Divit.
6. Click **Connect**.
   > [!TIP]
   > During this step, the plugin automatically calls Divit's profile API to verify your credentials. If successful, it writes your signature key securely to the **Wix Secret Manager** (under `divitSignatureKey` or `sandbox_divitSignatureKey` depending on your sandbox toggle) to protect them from public exposure.

---

## 🧪 Testing Your Integration

To verify that the payment gateway is operational:

### 1. E2E Checkout Flow
1. Visit your live site and add an item to your cart.
2. Go to the checkout page. Ensure the checkout currency is **HKD**.
3. Select **FPS by divit** as your payment method and submit the order.
4. You should be redirected securely to the Divit payment interface, displaying an FPS QR code or App redirect.
5. If in **Sandbox Mode**, complete the checkout using the Divit test payment options.

### 2. Webhook Event Check
1. Once checkout is completed, verify that the order payment transitions to **Paid** inside the **Wix Dashboard > Sales > Orders**.
2. If the order transitions instantly, the webhook callback (`post_updateDivitTransaction`) is communicating successfully!

### 3. Asynchronous Refund Check
1. Open the paid transaction in the Wix Orders panel.
2. Click **Refund** and enter a partial or full refund amount.
3. The refund status in Wix will immediately show as **Pending**.
4. Log in to your **Divit Merchant Admin Portal** and approve the pending refund request.
5. Within seconds, the status inside the Wix dashboard will transition from **Pending** to **Refunded**, proving that the asynchronous 2-step refund webhook flow is working flawlessly!