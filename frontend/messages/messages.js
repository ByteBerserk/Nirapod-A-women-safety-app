const sendBtn =
document.getElementById("sendMessageBtn");

sendBtn?.addEventListener("click", async () => {

    const input =
    document.getElementById("messageInput");

    const message = input.value.trim();

    if (!message) return;

    await fetch("/api/messages", {
        method: "POST",
        headers: {
            "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
            groupId: "group1",
            senderId: "user1",
            message
        })
    });

    input.value = "";
});