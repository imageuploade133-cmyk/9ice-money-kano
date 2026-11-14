import type { MetadataRoute } from "next";

/**
 * Installable PWA identity for 9iceMoney.
 * Existing icon artwork is retained until the approved 9iceMoney logo asset
 * is supplied, so installed clients continue to receive a valid icon URL.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "9iceMoney",
    short_name: "9iceMoney",
    description: "Secure digital wallet, payments and financial services by 9iceMoney.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#FC7A00",
    categories: ["finance", "business"],
    icons: [
      {
        src: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
