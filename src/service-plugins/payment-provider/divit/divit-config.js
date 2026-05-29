/** @returns {import('interfaces-psp-v1-payment-service-provider').PaymentServiceProviderConfig} */
export function getConfig() {
  return {
    title: "FPS by divit",
    paymentMethods: [
      {
        hostedPage: {
          title: "FPS by divit",
          billingAddressMandatoryFields: ["EMAIL"],
          logos: {
            white: {
              png: "https://static.divit.com.hk/brand/fps.png",
              svg: "https://static.divit.com.hk/fps/fps.svg",
            },
            colored: {
              png: "https://static.divit.com.hk/brand/fps.png",
              svg: "https://static.divit.com.hk/fps/fps.svg",
            },
          },
        },
      },
    ],
    credentialsFields: [
      {
        simpleField: {
          name: "apiKey",
          label: "API Key",
        },
      },
      {
        simpleField: {
          name: "signatureKey",
          label: "Signature Key",
        },
      },
      {
        checkboxField: {
          name: "sandbox",
          label: "Sandbox Mode",
          tooltip:
            "Enable sandbox mode for testing. Real payment transactions will not be settled.",
        },
      },
      {
        simpleField: {
          name: "sandboxApiKey",
          label: "API Key (Sandbox)",
        },
      },
      {
        simpleField: {
          name: "sandboxSignatureKey",
          label: "Signature Key (Sandbox)",
        },
      },
    ],
  };
}
