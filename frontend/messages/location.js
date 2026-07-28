const btn =
document.getElementById(
    "shareLocationBtn"
);

btn?.addEventListener(
    "click",
    () => {

        navigator.geolocation
        .getCurrentPosition(
            async(position)=>{

                await fetch(
                    "/api/locations",
                    {
                        method:"POST",
                        headers:{
                            "Content-Type":
                            "application/json"
                        },
                        body:JSON.stringify({
                            userId:
                            localStorage
                            .getItem(
                                "userId"
                            ),

                            groupId:
                            "group1",

                            latitude:
                            position.coords
                            .latitude,

                            longitude:
                            position.coords
                            .longitude
                        })
                    }
                );

                alert(
                  "Location shared!"
                );
            }
        );
    }
);