# Divit FPS Payment Gateway for Wix

[![Wix Compatibility](https://img.shields.io/badge/Wix-Velo%20%2F%20SPI-blue.svg)](https://dev.wix.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Currency](https://img.shields.io/badge/Currency-HKD%20Only-orange.svg)](#-currency-support)

An official Wix Payment Service Provider (PSP) SPI integration for **FPS by Divit**—the real-time, low-fee, pay-by-bank digital payment solution for modern e-commerce.

Developed by [Divit Limited](https://divit.com.hk). For complete API specifications and developer resources, visit the [Divit Developer Portal](https://developer.divit.com.hk).

---

## 📌 Table of Contents

- [✨ Features](#-features)
- [💵 Currency Support](#-currency-support)
- [🚀 Installation](#-installation)
- [🛠️ Technical Overview](#%EF%B8%8F-technical-overview)
  - [File Architecture](#file-architecture)
  - [Asynchronous Two-Step Refunds](#asynchronous-two-step-refunds)
  - [Sandbox vs Production Routing](#sandbox-vs-production-routing)
- [🔒 Security & Credential Safety](#-security--credential-safety)
- [📄 License](#-license)
- [🤝 Support](#-support)

---

## ✨ Features

* **Sleek Checkout Integration:** Fully integrates with the native Wix Checkout flow as an SPI-based hosted page payment provider.
* **Instant bank transfers:** Customers pay in real-time by scanning an automatically generated Faster Payment System (FPS) QR code or redirecting to their preferred local banking apps.
* **Flexible Environment Toggle:** Supports a **Sandbox Mode** checkbox directly inside the Wix dashboard connection panel, allowing seamless switching between production and test environments.
* **Asynchronous Two-Step Refunds:** Implements a custom 2-step manual approval refund workflow. Initiating refunds from the Wix Admin Panel places the transaction in a pending state, updating automatically via webhook callbacks once approved by Divit staff.
* **Stateless Secure Webhooks:** Leverages Wix Secret Manager (`divitSignatureKey` and `sandbox_divitSignatureKey`) to verify incoming HTTP notifications cryptographically using HMAC-SHA256 signatures, preventing spoofing.

---

## 💵 Currency Support

> [!IMPORTANT]
> This integration exclusively supports the **Hong Kong Dollar (HKD)** currency. Other currencies will be rejected at checkout in compliance with the Faster Payment System capabilities.

---

## 🚀 Installation

This integration is built as a custom Velo Payment SPI (Service Provider Interface) plugin. 

> [!TIP]
> For a detailed, step-by-step guide on creating files inside the Wix Editor, copying the integration scripts, setting up secrets, and verifying your installation, please refer to the **[Installation Guide (INSTALLATION.md)](./INSTALLATION.md)**.

---

## 🛠️ Technical Overview

### File Architecture

The integration consists of four main files designed to run inside the Wix Velo runtime environment:

| File Path | Purpose |
| :--- | :--- |
| [`src/service-plugins/payment-provider/divit/divit-config.js`](./src/service-plugins/payment-provider/divit/divit-config.js) | Defines the UI settings, checkout display titles, logos, and custom credentials inputs (API Key, Signature Key, and Sandbox toggles) rendered on the Wix Dashboard. |
| [`src/service-plugins/payment-provider/divit/divit.js`](./src/service-plugins/payment-provider/divit/divit.js) | Implements core Wix Payment SPI endpoints: `connectAccount`, `createTransaction`, and `refundTransaction`. Handles dynamic environment routing. |
| [`src/http-functions.js`](./src/http-functions.js) | A public webhook callback handler (`post_updateDivitTransaction`) that listens for real-time notification events (order paid, refund approved, refund cancelled, and order expired) from Divit's servers. |
| [`src/divit-constants.js`](./src/divit-constants.js) | Stores static environment-specific configuration constants, such as the `WEBSITE_URL` of your Wix store. |

### Asynchronous Two-Step Refunds

Unlike traditional cards, Divit refunds require staff approval before being finalized on-chain. 
1. When a refund is initiated in the Wix Dashboard, `refundTransaction` submits the refund request to Divit and returns a `5009` (Pending General) reason code. This instructs Wix to show the refund as **Pending** in the Merchant Admin Panel.
2. Once Divit staff approves or cancels the refund, an asynchronous webhook callback (`EVENT_ID_ORDER_REFUND_APPROVED` or `EVENT_ID_ORDER_REFUND_CANCELLED`) is fired to `http-functions.js`, which then securely submits the final status to Wix to update the dashboard.

### Sandbox vs Production Routing

The code resolves gateway environments dynamically depending on whether "Sandbox Mode" is checked in your Wix settings:

* **Production URL:** `https://api.divit.com.hk` (loads standard credentials and verifies webhooks with `divitSignatureKey`)
* **Sandbox URL:** `https://sandbox-api.divit.dev` (loads sandbox credentials and verifies webhooks with `sandbox_divitSignatureKey`)

---

## 🔒 Security & Credential Safety

This integration complies fully with the highest standard of web application security:
* **No Exposed Credentials:** API keys are processed and saved entirely on Wix's secure server side. No private API or signature credentials are ever exposed to client-side scripts.
* **Wix Secret Manager Storage:** The plugin isolates webhook validation by writing signature keys directly to the **Wix Secret Manager** via elevated backend permissions during connection, keeping them safe and secure from public exposure.
* **Cryptographic Verification:** Every incoming webhook notification must pass an HMAC-SHA256 signature verification matching the secret keys before modifying order states.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🤝 Support

For technical assistance or onboarding inquiries:
* **Company Website:** [Divit Limited](https://divit.com.hk)
* **Developer Portal:** [developer.divit.com.hk](https://developer.divit.com.hk)
* **Email:** [support@divit.com.hk](mailto:support@divit.com.hk)