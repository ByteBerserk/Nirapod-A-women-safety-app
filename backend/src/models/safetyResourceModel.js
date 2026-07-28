const safetyResources = [
    {
        id: "safety-tip-1",
        category: "self-defense",
        title: "Create distance first",
        description: "Use a strong voice, keep your hands up, and move toward a public or well-lit area before attempting any physical defense."
    },
    {
        id: "safety-tip-2",
        category: "emergency-guidelines",
        title: "Share your live location",
        description: "If you feel unsafe, activate SOS and share your live location with trusted contacts immediately."
    },
    {
        id: "safety-tip-3",
        category: "legal-rights",
        title: "Document incidents",
        description: "Save screenshots, photos, timestamps, and witness details to support any police report or legal complaint."
    },
    {
        id: "safety-tip-4",
        category: "personal-safety",
        title: "Plan your route ahead",
        description: "Share your route with someone you trust when traveling at night or in unfamiliar areas."
    },
    {
        id: "safety-tip-5",
        category: "emergency-guidelines",
        title: "Call local emergency services",
        description: "If there is immediate danger, contact local emergency services and keep your phone accessible."
    },
    {
        id: "safety-tip-6",
        category: "self-defense",
        title: "Target escape, not confrontation",
        description: "Use self-defense to break contact and escape. The goal is to get help as quickly as possible."
    }
];

const getSafetyResources = async () => safetyResources;

const getSafetyResourcesByCategory = async (category) => {
    const normalizedCategory = typeof category === "string" ? category.trim().toLowerCase() : "";
    return safetyResources.filter((resource) => resource.category === normalizedCategory);
};

export { getSafetyResources, getSafetyResourcesByCategory };